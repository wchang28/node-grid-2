import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import {IGlobal} from "./global";
import {Dispatcher} from './dispatcher';

/*
var $ = require('jquery-no-dom');
import ajaxon = require('ajaxon');
let $J = ajaxon($);
*/

//let configFile = (process.argv.length < 3 ? path.join(__dirname, '../local_testing_config.json') : process.argv[2]);
//let config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let clientApp = express();  // client facing app
let adminApp = express();   // admin web app
let nodeApp = express();    // node facing app

import nc = require('no-cache-express');
clientApp.use(nc);
adminApp.use(nc);
nodeApp.use(nc);

let bp = bodyParser.json({"limit":"999mb"});
clientApp.use(bp);
adminApp.use(bp);
nodeApp.use(bp);

let g: IGlobal = {
    dispatcher: new Dispatcher(null)
};

clientApp.set("global", g);
adminApp.set("global", g);
nodeApp.set("global", g);

clientApp.use('/client-app', require(path.join(__dirname, 'client-app')));
nodeApp.use('/node-app', require(path.join(__dirname, 'node-app')));

adminApp.use('/bower_components', express.static(path.join(__dirname, '../bower_components')));