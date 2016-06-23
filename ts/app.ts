import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
require('body-parser-xml')(bodyParser);
import {IGlobal} from "./global";
import {GridMessage, ITask, IUser} from "./messaging";
import {Dispatcher, IHostTaskDispatcher} from './dispatcher';

import {Router as nodeAppRouter, ConnectionsManager as nodeAppConnectionsManager} from './node-app';
import {Router as clientAppRouter} from './client-app';

interface IXMLExtendedBodyParser {
    xml: (options:any) => express.RequestHandler;
}

function getXMLExtendedBodyParser(bodyParser: any) : IXMLExtendedBodyParser {
    let x:IXMLExtendedBodyParser = bodyParser;
    return x;
}
/*
var $ = require('jquery-no-dom');
import ajaxon = require('ajaxon');
let $J = ajaxon($);
*/

//let configFile = (process.argv.length < 3 ? path.join(__dirname, '../local_testing_config.json') : process.argv[2]);
//let config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let clientApp = express();  // client facing app
let adminApp = express();   // admin web app
let nodeApp = express();   // node facing app

import nc = require('no-cache-express');
clientApp.use(nc);
adminApp.use(nc);
nodeApp.use(nc);

let bpj = bodyParser.json({"limit":"999mb"});   // json body middleware
clientApp.use(bpj);
adminApp.use(bpj);
nodeApp.use(bpj);

let bodyParserX = getXMLExtendedBodyParser(bodyParser);
let bpx = bodyParserX.xml({"limit":"999mb"});           // xml body middleware
clientApp.use(bpx);

let hd: IHostTaskDispatcher = (nodeId: string, task: ITask, done: (err: any) => void) : void => {
    let msg: GridMessage = {
        type: 'launch-task'
        ,content: task
    };
    nodeAppConnectionsManager.injectMessage('/topic/node/' + nodeId, {}, msg,  done);
};

let dispatcher = new Dispatcher(hd);
dispatcher.on('changed', ()=> {
    let o = dispatcher.toJSON();
    console.log(JSON.stringify(o));
});

let g: IGlobal = {
    dispatcher
};

clientApp.set("global", g);
adminApp.set("global", g);
nodeApp.set("global", g);

function getAppAuthorized(appRequireAdmin: boolean) {
    return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
        // TODO:
        /////////////////////////////////////////////////////////////////
        // 1. verify user using token in the header
        // 2. get user profile with prioity and admin flag
        let user:IUser = {
            userId: 'wchang'
            ,priority: 5
        }
        req["user"] = user;
        next();
        /////////////////////////////////////////////////////////////////
    };
}

clientApp.use('/client-app', getAppAuthorized(false), clientAppRouter);
nodeApp.use('/node-app', nodeAppRouter);

// /node-app/events/event_stream
// /client-app/events/event_stream
// /admin-app/events/event_stream

adminApp.use('/bower_components', express.static(path.join(__dirname, '../bower_components')));

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

let nodeServer = http.createServer(nodeApp);
let port = 26354;
let host = "127.0.0.1";

nodeServer.listen(port, host, () => {
	let host = nodeServer.address().address;
	let port = nodeServer.address().port;
	// console.log('app server listening at %s://%s:%s', (config.https ? 'https' : 'http'), host, port);
    console.log('app server listening at %s://%s:%s', 'http', host, port);
});