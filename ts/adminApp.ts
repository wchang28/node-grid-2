import {IWebServerConfig, startServer} from 'express-web-server';
import * as session from 'express-session';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import noCache = require('no-cache-express');
import * as oauth2 from 'oauth2';
import {TokenGrant as OAuth2TokenGrant} from 'oauth2-token-grant';
import * as errors from './errors';
import * as httpProxy from 'rcf-http-proxy'

interface ISessionOptions {
    sessionIdSignSecret: string;
}

interface IAppConfig {
    adminWebServerConfig: IWebServerConfig;
    sessionOptions: ISessionOptions;
    oauth2Options: oauth2.ClientAppOptions;
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../admin_testing_config.json') : process.argv[2]);
let config: IAppConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let tokenGrant = new OAuth2TokenGrant(config.oauth2Options.tokenGrantOptions, config.oauth2Options.clientAppSettings);

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

let adminApp = express();  // admin facing app

adminApp.use(noCache);

let secureCookie = (config.adminWebServerConfig.https ? true : false);

adminApp.use(session({
    secret: config.sessionOptions.sessionIdSignSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { path: '/', httpOnly: true, secure: secureCookie, maxAge: null }
}));

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

// evenstream located at:
// admin: /services/events/event_stream

startServer(config.adminWebServerConfig, adminApp, (secure:boolean, host:string, port:number) => {
    console.log('admin app server listening at %s://%s:%s', (secure ? 'https' : 'http'), host, port);
});
