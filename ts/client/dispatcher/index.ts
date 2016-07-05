import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {Dispatcher} from '../../dispatcher';

let router = express.Router();

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

// TODO: require admin
//=================================================================================
router.get('/queue/accept', (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.queueClosed = false;
    res.json({});
});

router.get('/queue/deny', (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.queueClosed = true;
    res.json({});
});

router.get('/dispatching/start', (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.dispatchEnabled = true;
    res.json({});
});

router.get('/dispatching/stop', (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.dispatchEnabled = false;
    res.json({});
});
//=================================================================================

export {router as Router};