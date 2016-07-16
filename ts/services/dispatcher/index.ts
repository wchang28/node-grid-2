import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {Dispatcher, INodeItem} from '../../dispatcher';
import {IGridUser} from '../../messaging';
import * as errors from '../../errors';

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
        res.status(401).json(errors.not_authorized);
}

router.get('/queue/open', canOpenCloseQueue, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.queueClosed = false;
    res.json(dispatcher.dispControl);
});

router.get('/queue/close', canOpenCloseQueue, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.queueClosed = true;
    res.json(dispatcher.dispControl);
});

function canStartStopDispatching(req: express.Request, res: express.Response, next: express.NextFunction) {
    let user = getUser(req);
    if (user.profile.canStartStopDispatching)
        next();
    else
        res.status(401).json(errors.not_authorized);
}

router.get('/dispatching/start', canStartStopDispatching, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.dispatchEnabled = true;
    res.json(dispatcher.dispControl);
});

router.get('/dispatching/stop', canStartStopDispatching, (req:express.Request, res:express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.dispatchEnabled = false;
    res.json(dispatcher.dispControl);
});

let nodeRouter = express.Router();
let nodeOperationRouter = express.Router();

nodeOperationRouter.get('/info', (req: express.Request, res: express.Response) => {
    let node:INodeItem = req['node'];
    res.json(node);
});

function canEnableDisableNode(req: express.Request, res: express.Response, next: express.NextFunction) {
    let user = getUser(req);
    if (user.profile.canEnableDisableNode)
        next();
    else
        res.status(401).json(errors.not_authorized);
}

nodeOperationRouter.get('/enable', canEnableDisableNode, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let node:INodeItem = req['node'];
    dispatcher.setNodeEnabled(node.id, true);
    res.json(node);
});

nodeOperationRouter.get('/disable', canEnableDisableNode, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let node:INodeItem = req['node'];
    dispatcher.setNodeEnabled(node.id, false);
    res.json(node);
});

function getNode(req: express.Request, res: express.Response, next: express.NextFunction) {
    let nodeId:string = req.params['nodeId'];
    if (!nodeId)
        res.status(400).json(errors.bad_node_id);
    else {
        let dispatcher = getDispatcher(req);
        let node = dispatcher.getNode(nodeId);
        if (!node)
            res.status(400).json(errors.invalid_node);
        else {
            req['node'] = node;
            next();
        }
    }
}

nodeRouter.use('/:nodeId', getNode, nodeOperationRouter);

router.use('/node', nodeRouter);


export {router as Router};