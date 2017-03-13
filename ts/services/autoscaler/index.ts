// route /services/autoscaler
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {GridAutoScaler} from 'grid-autoscaler';

let router = express.Router();

export {router as Router};

function getGlobal(req: express.Request) : IGlobal {return req.app.get('global');}
function getAutoScaler(req: express.Request) : GridAutoScaler {return getGlobal(req).gridAutoScaler;}

router.get('/is_scaling_up', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).ScalingUp);
});

router.post('/launch_new_workers', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).launchNewWorkers(req.body));
});

router.post('/terminate_workers', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).terminateWorkers(req.body));
});