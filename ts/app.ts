import {startServer} from 'express-web-server';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as core from 'express-serve-static-core';
import * as bodyParser from 'body-parser';
import noCache = require('no-cache-express');
import {IGlobal} from "./global";
import {IGridUserProfile, GridMessage, ITask, IGridUser, IJobProgress, Utils} from "grid-client-core";
import {Dispatcher} from './dispatcher';
import {get as getNodeMessenger} from './nodeMessaging';
import {ClientMessaging} from './clientMessaging';
import {getServerGridDB} from './gridDB';
import * as oauth2 from 'oauth2';
import {Router as nodeAppRouter, ConnectionsManager as nodeAppConnectionsManager} from './node-app';
import {Router as clientApiRouter, ConnectionsManager as clientConnectionsManager} from './services';
import * as events from 'events';
import * as errors from './errors';
import * as auth_client from 'polaris-auth-client';
import * as prettyPrinter from 'express-pretty-print';
import {IAppConfig} from './appConfig';
import {IWorker} from 'autoscalable-grid';
import {GridAutoScaler} from 'grid-autoscaler';
import {AutoScalableGridBridge} from './autoScalableGridBridge';
import {AutoScalerImplementationPackageExport, AutoScalerImplementationFactory, GetAutoScalerImplementationProc, AutoScalerImplementationOnChangeHandler} from 'grid-autoscaler-impl-pkg';
import {IAutoScalerImplementation} from 'autoscalable-grid';
import {get as processor} from "msg-transaction-processor";
import {receiver} from "./node-msg-trans-rcvr";

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../config/local_testing_config.json') : process.argv[2]);
let config: IAppConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let gridDB = getServerGridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
let tokenVerifier = new auth_client.TokenVerifier(config.authorizeEndpointOptions);

function initGridAutoScaler(dispatcher: Dispatcher, clientMessaging: ClientMessaging) : Promise<[GridAutoScaler, express.Router]> {
    return new Promise<[GridAutoScaler, express.Router]>((resolve: (value: [GridAutoScaler, express.Router]) => void, reject: (err: any) => void) => {
        if (config.autoScalerConfig && config.autoScalerConfig.implementationConfig && config.autoScalerConfig.implementationConfig.factoryPackagePath) {
            let packageExport: AutoScalerImplementationPackageExport = require(config.autoScalerConfig.implementationConfig.factoryPackagePath);
            if (packageExport.factory) {
                let getImpProc: GetAutoScalerImplementationProc = (req: express.Request) : Promise<IAutoScalerImplementation> => {
                    let global: IGlobal = req.app.get('global');
                    return Promise.resolve<IAutoScalerImplementation>(global.gridAutoScaler.Implementation);
                };
                packageExport.factory(getImpProc, config.autoScalerConfig.implementationConfig.options, () => {
                    clientMessaging.notifyClientsAutoScalerImplementationChanged();
                })
                .then((value: [IAutoScalerImplementation, express.Router]) => {
                    let autoScalerImpl = value[0];
                    let gridAutoScaler = new GridAutoScaler(new AutoScalableGridBridge(dispatcher), autoScalerImpl, config.autoScalerConfig.autoScalerOptions);
                    let autoScalerImplRouter = value[1];
                    resolve([gridAutoScaler, autoScalerImplRouter])
                }).catch((err: any) => {
                    reject(err);
                })
            } else {
                console.error("!!! Error loading auto-scaler implementation: cannot find the factory function in the package");
                resolve([null, null]);
            }
        } else
            resolve([null, null]);
    });
}

function authorizedClientMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) : void {
    let accessToken:oauth2.AccessToken = oauth2.Utils.getAccessTokenFromAuthorizationHeader(req.headers['authorization']);
    if (!accessToken)
        res.status(401).json(oauth2.errors.bad_credential);
    else {
        let user:auth_client.IAuthorizedUser = null;
        tokenVerifier.verifyAccessToken(accessToken)
        .then((value:auth_client.IAuthorizedUser) => {
            user = value;
            //console.log('user=' + JSON.stringify(user));
            return gridDB.getUserProfile(user.userId)
        }).then((profile: IGridUserProfile) => {
            let gridUser:IGridUser = {
                userId: user.userId
                ,userName: user.userName
                ,displayName: user.displayName
                ,email: user.email
                ,profile: profile
            }
            req["user"] = gridUser;
            next(); 
        }).catch((err: any) => {
            res.status(401).json(errors.not_authorized);
        });
    }
}

class ClientMessagingCoalescing extends events.EventEmitter {
    private __dirty = false;
    private __timer: NodeJS.Timer = null;
    constructor(private __pollingIntervalMS: number) {
        super();
    }
    mark() : void {
        if (!this.__dirty) this.__dirty = true;
    }
    start() : void {
        let timerProc = () : void => {
            if (this.__dirty) {
                this.__dirty = false;
                this.emit('trigger');
            }
            this.__timer = setTimeout(timerProc, this.__pollingIntervalMS);
        };
        if (!this.__timer) {
            this.__timer = setTimeout(timerProc, this.__pollingIntervalMS);
        }
    }
    stop(): void {
        if (this.__timer) {
            clearTimeout(this.__timer);
            this.__timer = null;
        }
    }
    get started(): boolean {return (this.__timer != null);}
}

gridDB.on('error', (err: any) => {
    console.error('!!! Database connection error: ' + JSON.stringify(err));
}).on('connect', () => {
    console.log('connected to the database :-)');

    let clientApp = express();  // client facing app
    let nodeApp = express();   // node facing app
    
    /*
    clientApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.log('\nmethod=' +req.method + ', url=' + req.url);
        console.log('headers=\n' + JSON.stringify(req.headers, null, 2));
        next();
    });
    */
    clientApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        res.header('Access-Control-Allow-Origin', '*');
        next();
    });

    clientApp.options("/*", (req: express.Request, res: express.Response) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH,HEAD');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Content-Length,X-Requested-With');
        res.send(200);
    });

    clientApp.use(noCache);
    nodeApp.use(noCache);

    let bpj = bodyParser.json({"limit":"999mb"});   // json body middleware
    clientApp.use(bpj);
    nodeApp.use(bpj);

    clientApp.use(prettyPrinter.get());

    clientApp.set('jsonp callback name', 'cb');

    let nodeMsgTransReceiver = receiver();
    let nodeMsgTransProcessor = processor(nodeMsgTransReceiver, {timeoutMS: 15000});

    let clientMessaging = new ClientMessaging(clientConnectionsManager);
    let dispatcher = new Dispatcher(getNodeMessenger(nodeAppConnectionsManager), gridDB, config.dispatcherConfig);

    let msgCoalesce = new ClientMessagingCoalescing(3000);
    msgCoalesce.on('trigger', () => {
        //console.log('<<triggered>>');
        clientMessaging.notifyClientsQueueChanged(dispatcher.queue);
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    });
    msgCoalesce.start();

    dispatcher.on('queue-changed', () => {
        msgCoalesce.mark();
    }).on('nodes-usage-changed', () => {
        msgCoalesce.mark();
    }).on('node-added', (nodeId:string) => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    }).on('node-ready', (nodeId:string) => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    }).on('node-removed', (nodeId:string) => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    }).on('node-enabled', (nodeId:string) => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    }).on('nodes-disabled', (nodeIds: string[]) => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    }).on('nodes-terminating', (nodeIds: string[]) => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);
    }).on('ctrl-changed', () => {
        clientMessaging.notifyClientsDispControlChanged(dispatcher.dispControl);
    }).on('jobs-tracking-changed', () => {
        clientMessaging.notifyClientsJobsTrackingChanged();
    }).on('job-status-changed', (jobProgress: IJobProgress) => {
        clientMessaging.notifyClientsJobStatusChanged(jobProgress);
    }).on('error',(err: any) => {
        console.error(new Date().toISOString() + ': !!! Dispatcher error: ' + JSON.stringify(err));
    }).on('kill-job-begin', (jobId: string) => {
        console.log(new Date().toISOString() + ': killing job ' + jobId.toString() + '...');
    }).on('kill-job-end', (jobId: string, err: any) => {
        console.log(new Date().toISOString() + ': job ' + jobId.toString() + ' kill process finished.' + (err ? ' error=' + JSON.stringify(err) : ' job was killed successfully :-)'));
    }).on('kill-job-poll', (jobId: string, pollNumber: number) => {
        console.log(new Date().toISOString() + ': job ' + jobId.toString() + ' kill poll #' + pollNumber.toString() + '...');
    }).on('job-submitted', (jobId: string) => {
        console.log(new Date().toISOString() + ': job ' + jobId.toString() + ' was submitted');
    }).on('job-finished', (jobId: string) => {
        console.log(new Date().toISOString() + ': job ' + jobId.toString() + ' is done');
        clientMessaging.notifyClientsJobDone(jobId);
    }).on('task-complete', (task: ITask) => {
        clientMessaging.notifyClientsTaskComplete(task);
    });

    clientConnectionsManager.on('change', () => {
        let o = clientConnectionsManager.toJSON();
        clientMessaging.notifyClientsConnectionsChanged(o);
    });
    
    initGridAutoScaler(dispatcher, clientMessaging)
    .then((value: [GridAutoScaler, express.Router]) => {
        let gridAutoScaler = value[0];
        let autoScalerImplRouter = value[1];

        if (gridAutoScaler) {
            console.log("grid auto-scaler loaded successfully :-)");
            gridAutoScaler.on('change', () => {
                clientMessaging.notifyClientsAutoScalerChanged();
            }).on('down-scaling', (workers: IWorker[])=> {
                console.log('<down-scaling>, workers=\n' + JSON.stringify(workers, null, 2));
            }).on('request-to-terminate-workers', (workerIds: string[])=> {
                console.log('<request-to-terminate-workers>, workerIds=\n' + JSON.stringify(workerIds, null, 2));
            }).on('set-workers-termination', (workerIds: string[])=> {
                console.log('<set-workers-termination>, workerIds=\n' + JSON.stringify(workerIds, null, 2));
            }).on('error', (err: any) => {
                console.error("!!! grid autoScaler error: err=" + JSON.stringify(err, null, 2));
            });
        } else
            console.log("grid auto-scaler is not available");

        let g: IGlobal = {
            dispatcher
            ,gridDB
            ,nodeMsgTransReceiver
            ,nodeMsgTransProcessor
            ,gridAutoScaler
        };

        clientApp.set("global", g);
        nodeApp.set("global", g);

        clientApp.use('/services', authorizedClientMiddleware, clientApiRouter);
        clientApp.get('/logout', authorizedClientMiddleware, (req: express.Request, res: express.Response) => {res.json({});});

        nodeApp.use('/node-app', nodeAppRouter);

        if (gridAutoScaler) {
            if (autoScalerImplRouter) {
                clientApp.use(Utils.getAutoScalerImplementationApiBasePath(), autoScalerImplRouter);
                console.log("grid auto-scaler implementation router is loaded and attached to '" + Utils.getAutoScalerImplementationApiBasePath() + "' :-)");
            } else
                console.log("no grid auto-scaler router detected");
        }

        // evenstream located at:
        // node server: /node-app/events/event_stream
        // grid api server: /services/events/event_stream

        startServer(config.nodeWebServerConfig, nodeApp, (secure:boolean, host:string, port:number) => {
            console.log('node app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
            startServer(config.clientWebServerConfig, clientApp, (secure:boolean, host:string, port:number) => {
                console.log('grid api server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
            });
        });
    }).catch((err: any) => {
        gridDB.disconnect();
        process.exit(1);
    });
});

gridDB.connect();  // connect to the grid database