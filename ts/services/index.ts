import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Router as dispatcherRouter} from './dispatcher';
import {Router as jobRouter} from './job';
import {Router as userRouter} from './user';
import * as tr from 'rcf-message-router';
import * as events from 'events';
import {IGridUser, Utils} from 'grid-client-core';

let router = express.Router();

function getUser(req: express.Request): IGridUser {
    let user:IGridUser = req["user"];
    return user;
}

router.use('/user', userRouter);
router.use('/job', jobRouter);
router.use('/dispatcher', dispatcherRouter);

let destAuthRouter = express.Router();

let destAuthHandler = tr.destAuth((req: tr.DestAuthRequest, res: tr.DestAuthResponse): void => {
    if (req.authMode === tr.DestAuthMode.Subscribe)
        res.accept();
    else
        res.reject();
});

destAuthRouter.use(Utils.getDispatcherTopic(), destAuthHandler);
destAuthRouter.use(Utils.getJobsTrackingTopic(), destAuthHandler);
destAuthRouter.use(Utils.getConnectionsTopic(), destAuthHandler);
//destAuthRouter.use('/topic/job/:jobId', destAuthHandler);
destAuthRouter.use('/topic/job', destAuthHandler);

let options: tr.Options = {
    connKeepAliveIntervalMS: 10000
    ,connCookieMaker: (req: express.Request) => {return getUser(req);}
    ,dispatchMsgOnClientSend: false
    ,destinationAuthorizeRouter: destAuthRouter
}

let ret = tr.get('/event_stream', options);
router.use('/events', ret.router); // topic subscription endpoint is available at /events/event_stream from this route

let connectionsManager = ret.connectionsManager;

connectionsManager.on('client_connect', (req:express.Request, connection: tr.ITopicConnection) : void => {
    console.log('client ' + connection.id + ' @ ' + connection.remoteAddress + ' connected to the SSE topic endpoint');
}).on('client_disconnect', (req:express.Request, connection: tr.ITopicConnection) : void => {
    console.log('client ' + connection.id + ' @ ' + connection.remoteAddress +  ' disconnected from the SSE topic endpoint');
});

router.get('/connections', (req: express.Request, res: express.Response) => {
    res.json(connectionsManager.toJSON());
});

export {router as Router, connectionsManager as ConnectionsManager};
