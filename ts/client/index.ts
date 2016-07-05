import * as express from 'express';
import * as core from 'express-serve-static-core';
import {getRouter as getJobRouter} from './job';
import {getRouter as getTopicRouter, ConnectedEventParams, ConnectionsManager, CommandEventParams} from 'sse-topic-router';
import {getConnectionFactory} from 'sse-topic-conn';

export interface ISSEConnectable {
    Router: core.Router;
    ConnectionsManager: ConnectionsManager;
}

export function getConnectable(): ISSEConnectable {
    let router = express.Router();
    router.use('/job', getJobRouter());

    let topicRouter = getTopicRouter('/event_stream', getConnectionFactory(10000));
    let connectionsManager = topicRouter.connectionsManager;

    router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

    let sc: ISSEConnectable = {
        Router: router
        ,ConnectionsManager: connectionsManager
    }
    return sc;
}