import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {Dispatcher} from '../../dispatcher';
import {IGridUser} from '../../messaging';

let router = express.Router();

function getUser(req: express.Request): IGridUser {
    let user:IGridUser = req["user"];
    return user;
}

function getDispatcher(req:express.Request) : Dispatcher {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

router.get('/', (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    res.json(dispatcher.toJSON());
});

router.get('/tracking_jobs', (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    res.json(dispatcher.trackingJobs);
});

function canOpenCloseQueue(req: express.Request, res: express.Response, next: express.NextFunction) {
    let user = getUser(req);
    if (user.profile.canOpenCloseQueue)
        next();
    else
        res.status(401).json({err: 'not authorized'});
}

router.get('/queue/accept', canOpenCloseQueue, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.queueClosed = false;
    res.json({});
});

router.get('/queue/deny', canOpenCloseQueue, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.queueClosed = true;
    res.json({});
});

function canStartStopDispatching(req: express.Request, res: express.Response, next: express.NextFunction) {
    let user = getUser(req);
    if (user.profile.canStartStopDispatching)
        next();
    else
        res.status(401).json({err: 'not authorized'});
}

router.get('/dispatching/start', canStartStopDispatching, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.dispatchEnabled = true;
    res.json({});
});

router.get('/dispatching/stop', canStartStopDispatching, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.dispatchEnabled = false;
    res.json({});
});

export {router as Router};