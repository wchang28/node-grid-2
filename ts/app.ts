import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import noCache = require('no-cache-express');
import {IGlobal} from "./global";
import {GridMessage, ITask, IGridUser, IJobTrackItem} from "./messaging";
import {Dispatcher, INodeMessaging, IDispatcherConfig} from './dispatcher';
import {NodeMessaging} from './nodeMessaging';
import {ClientMessaging} from './clientMessaging';
import {GridDB} from './gridDB';
import {IGridDBConfiguration} from './gridDBConfig';
import {Router as nodeAppRouter, ConnectionsManager as nodeAppConnectionsManager} from './node-app';
import {Router as clientApiRouter, ConnectionsManager as clientConnectionsManager} from './services';
import * as events from 'events';

interface IConfiguration {
    dbConfig: IGridDBConfiguration;
    dispatcherConfig?: IDispatcherConfig;
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../local_testing_config.json') : process.argv[2]);
let config: IConfiguration = JSON.parse(fs.readFileSync(configFile, 'utf8'));

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

let gridDB = new GridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
gridDB.on('error', (err: any) => {
    console.error('!!! Database connection error: ' + JSON.stringify(err));
}).on('connected', () => {
    console.error('connected to the database :-)');

    let clientApp = express();  // client facing app
    let nodeApp = express();   // node facing app
    
    clientApp.use(noCache);
    nodeApp.use(noCache);

    let bpj = bodyParser.json({"limit":"999mb"});   // json body middleware
    clientApp.use(bpj);
    nodeApp.use(bpj);

    // xml body middleware
    let bpx = bodyParser.text({
        "limit":"999mb"
        ,"type": (req: express.Request) : boolean => {
            let contentType = req.headers['content-type'];
            if (contentType.match(/text\/xml/gi) || contentType.match(/application\/xml/gi) || contentType.match(/application\/rss+xml/gi))
                return true;
            else
                return false;
        }
    });
    clientApp.use(bpx);

    let nodeMessaging: INodeMessaging = new NodeMessaging(nodeAppConnectionsManager);
    let clientMessaging = new ClientMessaging(clientConnectionsManager);

    let dispatcher = new Dispatcher(nodeMessaging, gridDB, config.dispatcherConfig);

    let msgCoalesce = new ClientMessagingCoalescing(3000);
    msgCoalesce.on('trigger', () => {
        console.log('<<triggered>>');
        clientMessaging.notifyClientsQueueChanged(dispatcher.queue, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on queue-changed: ' + JSON.stringify(err));
            }
        });
    });
    msgCoalesce.start();

    dispatcher.on('queue-changed', () => {
        msgCoalesce.mark();
    }).on('nodes-changed', () => {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on queue-changed: ' + JSON.stringify(err));
            }
        });
    }).on('ctrl-changed', () => {
        clientMessaging.notifyClientsDispControlChanged(dispatcher.dispControl, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on ctrl-changed: ' + JSON.stringify(err));
            }
        });
    }).on('jobs-tracking-changed', () => {
        // TODO:
    }).on('job-status-changed', (trackItem: IJobTrackItem) => {
        clientMessaging.notifyClientsJobStatusChanged(trackItem.ncks, trackItem.jp, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on jobs-status-changed: ' + JSON.stringify(err));
            }
        });
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
    });

    clientConnectionsManager.on('change', () => {
        let o = clientConnectionsManager.toJSON();
        clientMessaging.notifyClientsConnectionsChanged(o, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on connections-changed: ' + JSON.stringify(err));
            }
        });
    });
    
    let g: IGlobal = {
        dispatcher
    };

    clientApp.set("global", g);
    nodeApp.set("global", g);

    function authorizedClient(req: express.Request, res: express.Response, next: express.NextFunction): void {
        //console.log('reaching authorizedClient middleware, url=' + req.baseUrl);
        //console.log('=========================================================');
        //console.log(JSON.stringify(req.headers));
        //console.log('=========================================================');

        // TODO:
        /////////////////////////////////////////////////////////////////
        // 1. verify user using token in the header
        // 2. get user profile with prioity and admin flag
        let user:IGridUser = {
            userId: 'wchang'
            ,priority: 5
            ,profile: {
                canSubmitJob: true
                ,canKillOtherUsersJob: true
                ,canStartStopDispatching: true
                ,canOpenCloseQueue: true
                ,canEnableDisableNode: true
            }
        }
        req["user"] = user;
        next();
        /////////////////////////////////////////////////////////////////
    }

    clientApp.use('/services', authorizedClient, clientApiRouter);
    clientApp.use('/app', authorizedClient, express.static(path.join(__dirname, '../public')));

    // hitting the root of admin app
    clientApp.get('/', (req: express.Request, res: express.Response) => {
        // TODO: check session cookie and do oauth2
        let stateObj = req.query;	// query fields/state object might have marketing campaign code and application object short-cut link in it
        let state = JSON.stringify(stateObj);
        console.log('/: state=' + state);
        let redirectUrl = '/app';	// redirect user's browser to the /app path
        if (state !== '{}') {
            redirectUrl += '#state=' + encodeURIComponent(state);	// pass state to browser application via URL fragment (#)
        }
        res.redirect(redirectUrl);
    });

    nodeApp.use('/node-app', nodeAppRouter);

    // node: /node-app/events/event_stream
    // client: /services/events/event_stream

    clientApp.use('/bower_components', express.static(path.join(__dirname, '../bower_components')));

    /*
    let server = null;
    let wsConfig = null;

    if (config.https) {
        wsConfig = config.https;
        let sslConfig = wsConfig['ssl'];
        let private_key_file = sslConfig["private_key_file"];
        let certificate_file = sslConfig["certificate_file"];
        let ca_files = sslConfig["ca_files"];
        let privateKey  = fs.readFileSync(private_key_file, 'utf8');
        let certificate = fs.readFileSync(certificate_file, 'utf8');
        let credentials = {key: privateKey, cert: certificate};
        if (ca_files && ca_files.length > 0) {
            let ca = [];
            for (var i in ca_files)
                ca.push(fs.readFileSync(ca_files[i], 'utf8'));
            credentials["ca"] = ca;
        }
        server = https.createServer(credentials, app);
    } else {
        wsConfig = config.http;
        server = http.createServer(app);
    }

    let port = (wsConfig['port'] ? wsConfig['port'] : 81);
    let host = (wsConfig['host'] ? wsConfig['host'] : "127.0.0.1");	
    */

    let nodeAppServer = http.createServer(nodeApp);
    let nodeAppPort = 26354;
    let nodeAppHost = "127.0.0.1";

    nodeAppServer.listen(nodeAppPort, nodeAppHost, () => {
        let host = nodeAppServer.address().address;
        let port = nodeAppServer.address().port;
        // console.log('app server listening at %s://%s:%s', (config.https ? 'https' : 'http'), host, port);
        console.log('node app server listening at %s://%s:%s', 'http', host, port);

        let clientAppServer = http.createServer(clientApp);
        let clientAppPort = 26355;
        let clientAppHost = "127.0.0.1";

        clientAppServer.listen(clientAppPort, clientAppHost, () => {
            let host = clientAppServer.address().address;
            let port = clientAppServer.address().port;
            // console.log('app server listening at %s://%s:%s', (config.https ? 'https' : 'http'), host, port);
            console.log('client app server listening at %s://%s:%s', 'http', host, port);
        });
    });
});

gridDB.connect();  // connect to the grid database