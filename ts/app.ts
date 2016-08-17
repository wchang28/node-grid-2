import {IWebServerConfig, startServer} from 'express-web-server';
import * as session from 'express-session';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import noCache = require('no-cache-express');
import {IGlobal} from "./global";
import {IGridUserProfile, GridMessage, ITask, IGridUser, IJobProgress} from "./messaging";
import {Dispatcher, INodeMessaging, IDispatcherConfig} from './dispatcher';
import {NodeMessaging} from './nodeMessaging';
import {ClientMessaging} from './clientMessaging';
import {GridDB} from './gridDB';
import {IGridDBConfiguration} from './gridDBConfig';
import * as oauth2 from 'oauth2';
import {TokenGrant as OAuth2TokenGrant} from 'oauth2-token-grant';
import {Router as nodeAppRouter, ConnectionsManager as nodeAppConnectionsManager} from './node-app';
import {Router as clientApiRouter, ConnectionsManager as clientConnectionsManager} from './services';
import * as events from 'events';
import * as errors from './errors';
import * as auth_client from 'polaris-auth-client';
import * as httpProxy from 'rcf-http-proxy'

interface ISessionOptions {
    sessionIdSignSecret: string;
}

interface IAppConfig {
    nodeWebServerConfig: IWebServerConfig;
    clientWebServerConfig: IWebServerConfig;
    adminWebServerConfig: IWebServerConfig;
    sessionOptions: ISessionOptions;
    oauth2Options: oauth2.ClientAppOptions;
    authorizeEndpointOptions: auth_client.IAuthorizeEndpointOptions;
    dbConfig: IGridDBConfiguration;
    dispatcherConfig?: IDispatcherConfig;
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../local_testing_config.json') : process.argv[2]);
let config: IAppConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let gridDB = new GridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
let tokenGrant = new OAuth2TokenGrant(config.oauth2Options.tokenGrantOptions, config.oauth2Options.clientAppSettings);
let authClient: auth_client.AuthClient = new auth_client.AuthClient(config.authorizeEndpointOptions, config.oauth2Options.clientAppSettings);

function authorizedClientMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) : void {
    let errorReturn = () => {
        req.on('end', () => {
            res.status(401).json(errors.not_authorized);
        });
    };
    let accessToken:oauth2.AccessToken = null;
    let authHeader = req.headers['authorization'];
    if (authHeader) {   // automation client
        let x = authHeader.indexOf(' ');
        if (x != -1) {
            accessToken = {
                token_type: authHeader.substr(0, x)
                ,access_token: authHeader.substr(x+1)
            }
        }
    }
    if (!accessToken)
        errorReturn();
    else {
        authClient.verifyAccessToken(accessToken, (err: any, user:auth_client.IAuthorizedUser) => {
            if (err) {  // token verification error
                errorReturn();
            } else {   // access token is good
                //console.log('user=' + JSON.stringify(user));
                gridDB.getUserProfile(user.userId, (err: any, profile: IGridUserProfile) => {
                    if (err)
                        errorReturn();
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

interface AccessStore {
    access: oauth2.Access;
    grantTime: number;
}

function hasAccessMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) : void {
    let errorReturn = () => {
        req.on('end', () => {
            res.status(401).json(errors.not_authorized);
        });
    };
    let accessStore: AccessStore = req.session["access"];
    if (!accessStore || !accessStore.access)
        errorReturn();
    else
        next();
}

function autoRefreshTokenMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) : void {
    let accessStore: AccessStore = req.session["access"];
    let access = accessStore.access;
    let now = new Date();
    let tokenAutoRefreshIntervalHours = 4;
    let refreshIntervalMS = tokenAutoRefreshIntervalHours * 60 * 60 * 1000;
    if (access.refresh_token && now.getTime() - accessStore.grantTime > refreshIntervalMS) {
        tokenGrant.refreshAccessToken(access.refresh_token, (err:any, access: oauth2.Access) => {
            if (err)
                next();
            else {
                accessStore.access = access;
                accessStore.grantTime = new Date().getTime();
                next();
            }
        });
    } else {
        next();
    }
}

function makeAuthorizationHeaderMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) : void {
    let accessStore: AccessStore = req.session["access"];
    let access = accessStore.access;
    req.headers['authorization'] = access.token_type + ' ' + access.access_token;
    next();
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
    let adminApp = express();  // admin facing app
    
    clientApp.use(noCache);
    nodeApp.use(noCache);
    adminApp.use(noCache);

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

    adminApp.use(session({
        secret: config.sessionOptions.sessionIdSignSecret,
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
        clientMessaging.notifyClientsJobsTrackingChanged((err:any) => {
            if (err) {
                console.error('!!! Error notifying client on jobs-tracking-changed: ' + JSON.stringify(err));
            }
        });
    }).on('job-status-changed', (jobProgress: IJobProgress) => {
        clientMessaging.notifyClientsJobStatusChanged(jobProgress, (err:any) => {
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

    clientApp.use('/services', authorizedClientMiddleware, clientApiRouter);
    clientApp.get('/logout', authorizedClientMiddleware, (req: express.Request, res: express.Response) => {res.json({});});

    adminApp.use('/app', hasAccessMiddleware, express.static(path.join(__dirname, '../public')));
    adminApp.use('/bower_components', hasAccessMiddleware, express.static(path.join(__dirname, '../bower_components')));

    let targetAcquisition: httpProxy.TargetAcquisition = (req:express.Request, done: httpProxy.TargetAcquisitionCompletionHandler) => {
        let accessStore: AccessStore = req.session["access"];
        let access = accessStore.access;
        let targetSesstings: httpProxy.TargetSettings = {
            targetUrl: access.instance_url + '/services'
        }
        if (typeof access.rejectUnauthorized === 'boolean') targetSesstings.rejectUnauthorized = access.rejectUnauthorized;
        done(null, targetSesstings);
    };
    let proxyOptions: httpProxy.Options = {
        targetAcquisition: targetAcquisition
    };
    adminApp.use('/services', hasAccessMiddleware, autoRefreshTokenMiddleware, makeAuthorizationHeaderMiddleware, httpProxy.get(proxyOptions));

    // hitting the /authcode_callback via a browser redirect from the oauth2 server
    adminApp.get('/authcode_callback', (req: express.Request, res: express.Response) => {
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
                    req.session["access"] = {access, grantTime: new Date().getTime()};	// store the access token in session
                    res.redirect(redirectUrl);
                }
            });
        } else {
            res.end('path='+req.path);
        }
    });

    // hitting the root of admin app
    adminApp.get('/', (req: express.Request, res: express.Response) => {
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

    adminApp.get('/logout', (req: express.Request, res: express.Response) => {
        if (req.session["access"]) { // browser client
            req.session.destroy((err:any) => {
                // cannot access any more
                if (!err) {
                    console.log('session destroyed :-)');
                    console.log("redirecting user's browser to /");
                    res.redirect('/');
                } else {
                    console.log('unable to destroy session');
                    res.redirect('about:blank');
                }
            });
        }
    });

    nodeApp.use('/node-app', nodeAppRouter);

    // evenstream located at:
    // node: /node-app/events/event_stream
    // client: /services/events/event_stream
    // admin: /services/events/event_stream

    startServer(config.nodeWebServerConfig, nodeApp, (secure:boolean, host:string, port:number) => {
        console.log('node app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
        startServer(config.clientWebServerConfig, clientApp, (secure:boolean, host:string, port:number) => {
            console.log('client app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
            startServer(config.adminWebServerConfig, adminApp, (secure:boolean, host:string, port:number) => {
                console.log('admin app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
            });
        });
    });
});

gridDB.connect();  // connect to the grid database