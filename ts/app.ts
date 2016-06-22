import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import {IGlobal} from "./global";
import {Dispatcher, ITask, IHostTaskDispatcher} from './dispatcher';

import {Router as nodeAppRouter, ConnectionsManager as nodeAppConnectionsManager} from './node-app';

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

let bp = bodyParser.json({"limit":"999mb"});
clientApp.use(bp);
adminApp.use(bp);
nodeApp.use(bp);

let hd: IHostTaskDispatcher = (conn_id: string, task: ITask, done: (err: any) => void) : void => {
    let msg = {
        event: 'launch_task'
        ,content: task
    };
    nodeAppConnectionsManager.injectMessage('/topic/node/' + conn_id, {}, msg,  done);
};

let dispatcher = new Dispatcher(hd);
dispatcher.on('changed', ()=> {
    let json = dispatcher.toJSON();
});

let g: IGlobal = {
    dispatcher
};

clientApp.set("global", g);
adminApp.set("global", g);
nodeApp.set("global", g);

clientApp.use('/client-app', require(path.join(__dirname, 'client-app')));
nodeApp.use('/node-app', nodeAppRouter);

// /node-app/events/event_stream
// /client-app/events/event_stream
// /admin-app/events/event_stream

adminApp.use('/bower_components', express.static(path.join(__dirname, '../bower_components')));