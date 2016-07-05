import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Router as jobRouter} from './job';
import {getRouter as getTopicRouter, ConnectedEventParams, ConnectionsManager, CommandEventParams} from 'sse-topic-router';
import {getConnectionFactory} from 'sse-topic-conn';

let router = express.Router();
router.use('/job', jobRouter);

let topicRouter = getTopicRouter('/event_stream', getConnectionFactory(10000));
let connectionsManager = topicRouter.connectionsManager;

router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

export {router as Router, connectionsManager as ConnectionsManager};
