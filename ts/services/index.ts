import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Router as dispatcherRouter} from './dispatcher';
import {Router as jobRouter} from './job';
import {Router as userRouter} from './user';
import {getRouter as getTopicRouter, ConnectedEventParams, ConnectionsManager, CommandEventParams} from 'sse-topic-router';
import {getConnectionFactory} from 'sse-topic-conn';
import * as events from 'events';
import {IGridUser} from '../messaging';

let router = express.Router();

function getUser(req: express.Request): IGridUser {
    let user:IGridUser = req["user"];
    return user;
}

router.use('/user', userRouter);
router.use('/job', jobRouter);
router.use('/dispatcher', dispatcherRouter);

let topicRouter = getTopicRouter('/event_stream', getConnectionFactory(10000, (req: express.Request) => {
    let user = getUser(req);
    return user;
}));
router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

let routerEventEmitter = topicRouter.eventEmitter;
let connectionsManager = topicRouter.connectionsManager;

routerEventEmitter.on('client_connect', (params: ConnectedEventParams) : void => {
    console.log('client ' + params.conn_id + ' @ ' + params.remoteAddress + ' connected to the SSE topic endpoint');
});

routerEventEmitter.on('client_disconnect', (params: ConnectedEventParams) : void => {
    console.log('client ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
});

routerEventEmitter.on('sse_send', (s: string) => {
    if (s.match(/queue-changed/gi)) {
        console.log('sending => ' + s);
    }
});

router.get('/connections', (req: express.Request, res: express.Response) => {
    res.json(connectionsManager.toJSON());
});

export {router as Router, connectionsManager as ConnectionsManager};
