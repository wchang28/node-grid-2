// route /services/autoscaler
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {GridAutoScaler} from 'grid-autoscaler';
import {AutoScalerImplementationInfo} from  'grid-client-core';

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

router.post('/terminate_launching_workers', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).terminateLaunchingWorkers(req.body));
});

router.get('/is_enabled', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).Enabled);
});

router.post('/enable', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).Enabled = true;
    res.jsonp({});
});

router.post('/disable', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).Enabled = false;
    res.jsonp({});
});

router.get('/has_max_workers_cap', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).HasMaxWorkersCap);
});

router.get('/has_min_workers_cap', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).HasMinWorkersCap);
});

router.get('/get_max_workers_cap', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).MaxWorkersCap);
});

router.post('/set_max_workers_cap', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).MaxWorkersCap = req.body.value;
    res.jsonp(getAutoScaler(req).MaxWorkersCap);
});

router.get('/get_min_workers_cap', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).MinWorkersCap);
});

router.post('/set_min_workers_cap', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).MinWorkersCap = req.body.value;
    res.jsonp(getAutoScaler(req).MinWorkersCap);
});

router.get('/get_launching_timeout_minutes', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).LaunchingTimeoutMinutes);
});

router.post('/set_launching_timeout_minutes', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).LaunchingTimeoutMinutes = req.body.value;
    res.jsonp(getAutoScaler(req).LaunchingTimeoutMinutes);
});

router.get('/get_terminate_worker_after_minutes_idle', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).TerminateWorkerAfterMinutesIdle);
});

router.post('/set_terminate_worker_after_minutes_idle', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).TerminateWorkerAfterMinutesIdle = req.body.value;
    res.jsonp(getAutoScaler(req).TerminateWorkerAfterMinutesIdle);
});

router.get('/get_ramp_up_speed_ratio', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).RampUpSpeedRatio);
});

router.post('/set_ramp_up_speed_ratio', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).RampUpSpeedRatio = req.body.value;
    res.jsonp(getAutoScaler(req).RampUpSpeedRatio);
});

router.get('/get_launching_workers', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).LaunchingWorkers);
});

router.get('/', (req: express.Request, res: express.Response) => {
    res.jsonp(getAutoScaler(req).toJSON());
});

router.get('/get_impl_info', (req: express.Request, res: express.Response) => {
    getAutoScaler(req).ImplementationInfo
    .then((info: AutoScalerImplementationInfo) => {
        res.jsonp(info);
    }).catch((err: any) => {
        res.status(400).json(err);
    });
});