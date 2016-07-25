import {IWebServerConfig, startServer} from 'express-web-server';
import * as session from 'express-session';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import noCache = require('no-cache-express');
import {IGlobal} from "./global";
import {IGridUserProfile, GridMessage, ITask, IGridUser, IJobTrackItem} from "./messaging";
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
import {IAuthorizedUser, IAccessTokenVerifier} from './accessTokenVerifier';
let $ = require('jquery-no-dom');

// TODO: remove test code later
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
class TestTokenVerifier implements IAccessTokenVerifier {
    constructor() {}
    verify(accessToken: oauth2.AccessToken, done:(err:errors.IError, user: IAuthorizedUser) => void) : void {
        if (accessToken.token_type === 'Bearer' && accessToken.access_token === '98ghqhvra89vajvo834perd9i8237627bgvm') {
            let user:IAuthorizedUser = {
                userId: 'genericGridUser7'
                ,userName: 'genericGridUser'
            };
            done(null, user);
        } else if (accessToken.token_type === 'Bearer' && accessToken.access_token === 'tiutrtugghir5899y4hggoirtwrogj45hrtg0p9wug45') {
            let user:IAuthorizedUser = {
                userId: 'gkfklgnh965yu690u50hj0j0j6'
                ,userName: 'wchang'
            };
            done(null, user);
        } else
            done(errors.not_authorized, null);
    }
}

let tokenVerifier: IAccessTokenVerifier = new TestTokenVerifier();
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

interface IAppConfig {
    nodeWebServerConfig: IWebServerConfig;
    clientWebServerConfig: IWebServerConfig;
    oauth2Options: oauth2.ClientAppOptions;
    dbConfig: IGridDBConfiguration;
    dispatcherConfig?: IDispatcherConfig;
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../local_testing_config.json') : process.argv[2]);
let config: IAppConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let gridDB = new GridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
let tokenGrant = new oauth2.TokenGrant($, config.oauth2Options.tokenGrantOptions, config.oauth2Options.clientAppSettings);

function authorizedClient(req: express.Request, res: express.Response, next: express.NextFunction): void {
    let access: oauth2.Access = null;
    let accessToken:oauth2.AccessToken = null;
    let authHeader = req.headers['authorization'];
    if (authHeader) {
        let x = authHeader.indexOf(' ');
        if (x != -1) {
            accessToken = {
                token_type: authHeader.substr(0, x)
                ,access_token: authHeader.substr(x+1)
            }
        }
    } else if (req.session["access"]) {
        access = req.session["access"];
        accessToken = {
            token_type: access.token_type
            ,access_token: access.access_token
        }
    }

    if (!accessToken) {
        res.status(401).json(errors.not_authorized);
        return;
    }

    tokenVerifier.verify(accessToken, (err: errors.IError, user:IAuthorizedUser) => {
        if (err) {
            // TODO: if error is token expired, do
            ///////////////////////////////////////////////////////////////////////////////////////////////////
            /*
            if (access && access.refresh_token) {
                tokenGrant.refreshAccessToken(access.refresh_token, (err:any, access: oauth2.Access) => {
                    if (err)
                        res.status(401).json(err);
                    else {
                        req.session["access"] = access;
                        authorizedClient(req, res, next);
                    }
                });
            }
            ///////////////////////////////////////////////////////////////////////////////////////////////////
            */
            res.status(401).json(err);
        } else {   // no error
            gridDB.getUserProfile(user.userId, (err: any, profile: IGridUserProfile) => {
                if (err)
                    res.status(401).json(errors.not_authorized);
                else {
                    let gridUser:IGridUser = {
                        userId: user.userId
                        ,userName: user.userName
                        ,profile: profile
                    }
                    req["user"] = gridUser;
                    next();                    
                }
            });
        }
    });
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

    clientApp.set('jsonp callback name', 'cb');

    let secureCookie = (config.clientWebServerConfig.https ? true : false);

    clientApp.use(session({
        secret: 'fhgdfgdfgdag05y5wgt',
        resave: false,
        saveUninitialized: false,
        cookie: { path: '/', httpOnly: true, secure: secureCookie, maxAge: null }
    }));

    let nodeMessaging: INodeMessaging = new NodeMessaging(nodeAppConnectionsManager);
    let clientMessaging = new ClientMessaging(clientConnectionsManager);

    let dispatcher = new Dispatcher(nodeMessaging, gridDB, config.dispatcherConfig);

    function notifyClientsNodesChanges() {
        clientMessaging.notifyClientsNodesChanged(dispatcher.nodes, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on nodes-changed: ' + JSON.stringify(err));
            }
        });        
    }

    let msgCoalesce = new ClientMessagingCoalescing(3000);
    msgCoalesce.on('trigger', () => {
        console.log('<<triggered>>');
        clientMessaging.notifyClientsQueueChanged(dispatcher.queue, (err:any) => {
            if (err) {
                console.error('!!! Error notifying client on queue-changed: ' + JSON.stringify(err));
            } else {
                notifyClientsNodesChanges();
            }
        });
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

    clientApp.use('/services', authorizedClient, clientApiRouter);
    clientApp.use('/app', authorizedClient, express.static(path.join(__dirname, '../public')));

    // hitting the /authcode_callback via a browser redirect from the oauth2 server
    clientApp.get('/authcode_callback', (req: express.Request, res: express.Response) => {
        let query:oauth2.AuthCodeWorkflowQueryParams = req.query;
        if (JSON.stringify(query) != '{}') {
            console.log('auth_code='+query.code);
            console.log('aquiring access token from auth_code...');
            tokenGrant.getAccessTokenFromAuthCode(query.code, (err, access: oauth2.Access)  => {
                if (err) {
                    console.error('!!! Error: ' + JSON.stringify(err));
                    res.status(400).json(err);
                } else {
                    console.log(':-) access token granted. access=' + JSON.stringify(access));
                    let redirectUrl = '/';	// redirect user's browser to the root
                    if (query.state) {
                        try {
                            let stateObj = JSON.parse(query.state);
                            let ar = [];
                            for (let fld in stateObj)
                                ar.push(encodeURIComponent(fld) + '=' + encodeURIComponent(stateObj[fld]));
                            if (ar.length > 0) redirectUrl += '?' + ar.join('&');
                        } catch(e) {}
                    }
                    req.session["access"] = access;	// store the access token in session
                    res.redirect(redirectUrl);
                }
            });
        } else {
            res.end('path='+req.path);
        }
    });

    // hitting the root of admin app
    clientApp.get('/', (req: express.Request, res: express.Response) => {
        let sess = req.session;
        let stateObj = req.query;	// query fields/state object might have marketing campaign code and application object short-cut link in it
        let state = JSON.stringify(stateObj);
        if (sess["access"]) {	// hitting the application root with access token in the session
            console.log('/: state=' + state);
            let redirectUrl = '/app';	// redirect user's browser to the /app path
            if (state !== '{}') {
                redirectUrl += '#state=' + encodeURIComponent(state);	// pass state to browser application via URL fragment (#)
            }
            res.redirect(redirectUrl);
        } else {    // hitting the application root without access token in session
            let oauth2Options = config.oauth2Options;
            let params:oauth2.AuthorizationWorkflowParams = {
                response_type: 'code'
                ,client_id: oauth2Options.clientAppSettings.client_id
                ,redirect_uri: oauth2Options.clientAppSettings.redirect_uri
            };
            if (state !== '{}') params.state = state;
            let redirectUrl = oauth2.Utils.getAuthWorkflowRedirectUrlWithQueryString(oauth2Options.authorizationRedirectUrl, params);
            res.redirect(redirectUrl);
        }
    });

    nodeApp.use('/node-app', nodeAppRouter);

    // evenstream located at:
    // node: /node-app/events/event_stream
    // client: /services/events/event_stream

    clientApp.use('/bower_components', express.static(path.join(__dirname, '../bower_components')));

    startServer(config.nodeWebServerConfig, nodeApp, (secure:boolean, host:string, port:number) => {
        console.log('node app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
        startServer(config.clientWebServerConfig, clientApp, (secure:boolean, host:string, port:number) => {
            console.log('client app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
        });
    });
});

gridDB.connect();  // connect to the grid database