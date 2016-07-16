import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {Dispatcher} from '../../dispatcher';
import {IGridUser, IJobInfo} from '../../messaging';
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

function canSubmitJob(req: express.Request, res: express.Response, next: express.NextFunction) {
    let user = getUser(req);
    if (user.profile.canSubmitJob)
        next();
    else
        res.status(401).json(errors.not_authorized);
}

// body: job in xml
// query:
// 1. nc (optional)
router.post('/submit', canSubmitJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    let query = req.query;
    dispatcher.submitJob(user, req.body, (error: any, jobId:string) => {
        if (error)
            res.status(400).json({error});
        else
            res.json({jobId});
    }, (query['nc'] ? query['nc'] : null));
});

function canKillJob(req: express.Request, res: express.Response, next: express.NextFunction) {
    let jobInfo:IJobInfo = req['jobInfo'];
    let user = getUser(req);
    if (user.profile.canKillOtherUsersJob || user.userId === jobInfo.userId)
        next();
    else
        res.status(401).json(errors.not_authorized);
}

let jobOperationRouter = express.Router();

jobOperationRouter.get('/kill', canKillJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let jobInfo:IJobInfo = req['jobInfo'];
    dispatcher.killJob(jobInfo.jobId, (error: any) => {
        if (error)
            res.status(400).json({error});
        else
            res.json({});
    });
});

jobOperationRouter.get('/info', (req: express.Request, res: express.Response) => {
    let jobInfo:IJobInfo = req['jobInfo'];
    res.json(jobInfo);
});

// query:
// 1. failedTasksOnly (optional)
// 2. nc (optional)
jobOperationRouter.get('/re_submit', canSubmitJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    let jobInfo:IJobInfo = req['jobInfo'];
    let query = req.query;
    let fto = query['failedTasksOnly'];
    let failedTasksOnly = (fto ? (isNaN(parseInt(fto)) ? false : parseInt(fto) !== 0) : false);
    dispatcher.reSubmitJob(user, jobInfo.jobId, failedTasksOnly, (error: any, jobId:string) => {
        if (error)
            res.status(400).json({error});
        else
            res.json({jobId});
    }, (query['nc'] ? query['nc'] : null));
});

function getJobInfo(req: express.Request, res: express.Response, next: express.NextFunction) {
    let jobId:string = req.params['jobId'];
    if (!jobId)
        res.status(400).json(errors.bad_job_id);
    else {
        let dispatcher = getDispatcher(req);
        dispatcher.getJobInfo(jobId, (error:any, jobInfo: IJobInfo) => {
            if (error)
                res.status(400).json({error});
            else {
                req['jobInfo'] = jobInfo;
                next();
            }
        });
    }
}

router.use('/:jobId', getJobInfo, jobOperationRouter);

export {router as Router}; 