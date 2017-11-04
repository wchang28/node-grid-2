// route /services
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Router as dispatcherRouter} from './dispatcher';
import {Router as jobRouter} from './job';
import {Router as userRouter} from './user';
import {Router as nodeRouter} from './node';
import {Router as scalableRouter} from './scalable';
import {Router as autoscalerRouter} from './autoscaler';
import * as tr from 'rcf-message-router';
import * as events from 'events';
import {IGridUser, Utils, Times} from 'grid-client-core';
import {IServerGridDB} from '../gridDB';
import {IGlobal} from '../global';

let router = express.Router();

function getUser(req: express.Request): IGridUser {
    let user:IGridUser = req["user"];
    return user;
}
function getGlobal(req:express.Request) : IGlobal {return req.app.get('global');}
function autoScalerAvailable(req:express.Request) : boolean {return (getGlobal(req).gridAutoScaler ? true : false);}
function getDB(req:express.Request) : IServerGridDB {return getGlobal(req).gridDB;}

router.use('/user', userRouter);
router.use('/job', jobRouter);
router.use('/dispatcher', dispatcherRouter);
router.use('/node', nodeRouter);
router.use('/scalable', scalableRouter);
router.use('/autoscaler', (req:express.Request, res: express.Response, next: express.NextFunction) => {
    if (autoScalerAvailable(req))
        next();
    else
        res.status(400).json({error: "autoscaler-not-available", error_description: "auto-scaler is not setup for this grid"});
}, autoscalerRouter);

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
destAuthRouter.use(Utils.getAutoScalerTopic(), destAuthHandler);
destAuthRouter.use('/topic/job', destAuthHandler);

let options: tr.Options = {
    connKeepAliveIntervalMS: 10000
    ,connCookieMaker: (req: express.Request) => {return getUser(req);}  // connection cookie is the user
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

router.get('/times', (req: express.Request, res: express.Response) => {
    getDB(req).getTime()
    .then((dbTime: number) => {
        res.jsonp({serverTime: new Date().getTime(), dbTime});
    }).catch((err: any) => {
        res.status(400).json(err);
    });
});

router.get('/autoscaler_available', (req: express.Request, res: express.Response) => {
    res.jsonp(autoScalerAvailable(req));
});

export {router as Router, connectionsManager as ConnectionsManager};
