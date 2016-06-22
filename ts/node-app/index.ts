import * as express from 'express';
import * as core from 'express-serve-static-core';
import {getRouter as getTopicRouter, ConnectedEventParams} from 'sse-topic-router';
import {getConnectionFactory} from 'sse-topic-conn';

import {ITaskItem} from "../dispatcher";
import {IGlobal} from '../global'; 

let router = express.Router();

let topicRouter = getTopicRouter('/event_stream', getConnectionFactory(5000));
router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

topicRouter.eventEmitter.on('client_connect', (params: ConnectedEventParams) : void => {
    console.log('clinet ' + params.conn_id + ' @ ' + params.remoteAddress + ' connected to the SSE topic endpoint');
});

topicRouter.eventEmitter.on('client_disconnect', (params: ConnectedEventParams) : void => {
    console.log('clinet ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
});

export = router;