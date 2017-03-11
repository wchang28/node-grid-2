// route /services/scaleble
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Dispatcher} from '../../dispatcher';
import {IGlobal} from '../../global';

let router = express.Router();

export {router as Router};

function getDispatcher(req:express.Request) : Dispatcher {
    let g:IGlobal = req.app.get('global');
    return g.dispatcher;
}

router.get('/state', (req: express.Request, res: express.Response) => {
    res.jsonp(getDispatcher(req).AutoScalableState);
});

router.post('/disable_workers', (req: express.Request, res: express.Response) => {
    getDispatcher(req).disableNodes(req.body);
    res.jsonp({});
});

router.post('/set_workers_terminating', (req: express.Request, res: express.Response) => {
    getDispatcher(req).setNodesTerminating(req.body);
    res.jsonp({});
});