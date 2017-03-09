import {IWebServerConfig, startServer} from 'express-web-server';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import noCache = require('no-cache-express');
import {IGlobal} from "./global";
import {IGridUserProfile, GridMessage, ITask, IGridUser, IJobProgress} from "grid-client-core";
import {Dispatcher, INodeMessaging, IDispatcherConfig} from './dispatcher';
import {NodeMessaging} from './nodeMessaging';
import {ClientMessaging} from './clientMessaging';
import {GridDB} from './gridDB';
import {IGridDBConfiguration} from './gridDBConfig';
import * as oauth2 from 'oauth2';
import {Router as nodeAppRouter, ConnectionsManager as nodeAppConnectionsManager} from './node-app';
import {Router as clientApiRouter, ConnectionsManager as clientConnectionsManager} from './services';
import * as events from 'events';
import * as errors from './errors';
import * as auth_client from 'polaris-auth-client';
import * as prettyPrinter from 'express-pretty-print';

interface IAppConfig {
    nodeWebServerConfig: IWebServerConfig;
    clientWebServerConfig: IWebServerConfig;
    authorizeEndpointOptions: auth_client.IAuthorizeEndpointOptions;
    dbConfig: IGridDBConfiguration;
    dispatcherConfig?: IDispatcherConfig;
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../local_testing_config.json') : process.argv[2]);
let config: IAppConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let gridDB = new GridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
let tokenVerifier = new auth_client.TokenVerifier(config.authorizeEndpointOptions);

function authorizedClientMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) : void {
    let accessToken:oauth2.AccessToken = oauth2.Utils.getAccessTokenFromAuthorizationHeader(req.headers['authorization']);
    if (!accessToken)
        res.status(401).json(oauth2.errors.bad_credential);
    else {
        tokenVerifier.verifyAccessToken(accessToken, (err: any, user:auth_client.IAuthorizedUser) => {
            if (err) {  // token verification error
                res.status(401).json(oauth2.errors.bad_credential);
            } else {   // access token is good
                //console.log('user=' + JSON.stringify(user));
                gridDB.getUserProfile(user.userId, (err: any, profile: IGridUserProfile) => {
                    if (err)
                        res.status(401).json(errors.not_authorized);
                    else {
                        let gridUser:IGridUser = {
                            userId: user.userId
                            ,userName: user.userName
                            ,displayName: user.displayName
                            ,email: user.email
                            ,profile: profile
                        }
                        req["user"] = gridUser;
                        next();                    
                    }
                });
            }
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
}).on('connected', () => {
    console.log('connected to the database :-)');

    let clientApp = express();  // client facing app
    let nodeApp = express();   // node facing app
    
    clientApp.use(noCache);
    nodeApp.use(noCache);

    let bpj = bodyParser.json({"limit":"999mb"});   // json body middleware
    clientApp.use(bpj);
    nodeApp.use(bpj);

    clientApp.use(prettyPrinter.get());

    clientApp.set('jsonp callback name', 'cb');

    let nodeMessaging: INodeMessaging = new NodeMessaging(nodeAppConnectionsManager);
    let clientMessaging = new ClientMessaging(clientConnectionsManager);

    let dispatcher = new Dispatcher(nodeMessaging, gridDB, config.dispatcherConfig);

    function notifyClientsNodesChanges() {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes);        
    }

    let msgCoalesce = new ClientMessagingCoalescing(3000);
    msgCoalesce.on('trigger', () => {
        console.log('<<triggered>>');
        clientMessaging.notifyClientsQueueChanged(dispatcher.queue);
        notifyClientsNodesChanges();
    });
    msgCoalesce.start();

    dispatcher.on('queue-changed', () => {
        msgCoalesce.mark();
    }).on('nodes-usage-changed', () => {
        msgCoalesce.mark();
    }).on('node-added', (nodeId:string) => {
        notifyClientsNodesChanges();
    }).on('node-ready', (nodeId:string) => {
        notifyClientsNodesChanges();
    }).on('node-removed', (nodeId:string) => {
        notifyClientsNodesChanges();
    }).on('node-enabled', (nodeId:string) => {
        notifyClientsNodesChanges();
    }).on('node-disabled', (nodeId:string) => {
        notifyClientsNodesChanges();
    }).on('ctrl-changed', () => {
        clientMessaging.notifyClientsDispControlChanged(dispatcher.dispControl);
    }).on('jobs-tracking-changed', () => {
        clientMessaging.notifyClientsJobsTrackingChanged();
    }).on('job-status-changed', (jobProgress: IJobProgress) => {
        clientMessaging.notifyClientsJobStatusChanged(jobProgress);
    }).on('error',(err: any) => {
        console.error('!!! Dispatcher error: ' + JSON.stringify(err));
    }).on('kill-job-begin', (jobId: string) => {
        console.log('killing job ' + jobId.toString() + '...');
    }).on('kill-job-end', (jobId: string, err: any) => {
        console.log('job ' + jobId.toString() + ' kill process finished.' + (err ? ' error=' + JSON.stringify(err) : ' job was killed successfully :-)'));
    }).on('kill-job-poll', (jobId: string, pollNumber: number) => {
        console.log('job ' + jobId.toString() + ' kill poll #' + pollNumber.toString() + '...');
    }).on('job-submitted', (jobId: string) => {
        console.log('job ' + jobId.toString() + ' was submitted');
    }).on('job-finished', (jobId: string) => {
        console.log('job ' + jobId.toString() + ' is finished');
    }).on('task-complete', (task: ITask) => {
        clientMessaging.notifyClientsTaskComplete(task);
    });

    clientConnectionsManager.on('change', () => {
        let o = clientConnectionsManager.toJSON();
        clientMessaging.notifyClientsConnectionsChanged(o);
    });
    
    let g: IGlobal = {
        dispatcher
        ,gridDB
    };

    clientApp.set("global", g);
    nodeApp.set("global", g);

    clientApp.use('/services', authorizedClientMiddleware, clientApiRouter);
    clientApp.get('/logout', authorizedClientMiddleware, (req: express.Request, res: express.Response) => {res.json({});});

    nodeApp.use('/node-app', nodeAppRouter);

    // evenstream located at:
    // node: /node-app/events/event_stream
    // client: /services/events/event_stream

    startServer(config.nodeWebServerConfig, nodeApp, (secure:boolean, host:string, port:number) => {
        console.log('node app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
        startServer(config.clientWebServerConfig, clientApp, (secure:boolean, host:string, port:number) => {
            console.log('client app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
        });
    });
});

gridDB.connect();  // connect to the grid database