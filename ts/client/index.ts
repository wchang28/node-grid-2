import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Router as dispatcherRouter} from './dispatcher';
import {Router as jobRouter} from './job';
import {getRouter as getTopicRouter, ConnectedEventParams, ConnectionsManager, CommandEventParams} from 'sse-topic-router';
import {getConnectionFactory} from 'sse-topic-conn';

let router = express.Router();

router.use('/job', jobRouter);
router.use('/dispatcher', dispatcherRouter);

let topicRouter = getTopicRouter('/event_stream', getConnectionFactory(10000));
let connectionsManager = topicRouter.connectionsManager;

router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

topicRouter.eventEmitter.on('client_connect', (params: ConnectedEventParams) : void => {
    console.log('client ' + params.conn_id + ' @ ' + params.remoteAddress + ' connected to the SSE topic endpoint');
});

topicRouter.eventEmitter.on('client_disconnect', (params: ConnectedEventParams) : void => {
    console.log('client ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
});

export {router as Router, connectionsManager as ConnectionsManager};
