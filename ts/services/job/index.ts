// router services/job
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {Dispatcher} from '../../dispatcher';
import {IGridUser, IJobProgress, IJobInfo, IJobResult} from 'grid-client-core';
import * as errors from '../../errors';
import {Router as taskRouter} from './task';

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

// body: IJobSubmit
router.post('/submit', canSubmitJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    dispatcher.submitJob(user, req.body, (error: any, jobProgress:IJobProgress) => {
        if (error)
            res.status(400).json({error});
        else
            res.json(jobProgress);
    });
});

router.get('/most_recent', (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.getMostRecentJobs((error:any, jobInfos:IJobInfo[]) => {
        if (error)
            res.status(400).json({error});
        else
            res.json(jobInfos);
    });
});

// job operation/method invoke router
let jobOperationRouter = express.Router();

let getJobInfo = (req: express.Request): IJobInfo => {
    return req['jobInfo'];
}

function canKillJobMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    let jobInfo = getJobInfo(req);
    let user = getUser(req);
    if (user.profile.canKillOtherUsersJob || user.userId === jobInfo.userId)
        next();
    else
        res.status(401).json(errors.not_authorized);
}

// kill job
jobOperationRouter.get('/kill', canKillJobMiddleware, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let jobInfo = getJobInfo(req);
    dispatcher.killJob(jobInfo.jobId, (error: any) => {
        if (error)
            res.status(400).json({error});
        else
            res.json({});
    });
});

// job progress
jobOperationRouter.get('/progress', (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let jobInfo = getJobInfo(req);
    dispatcher.getJobProgress(jobInfo.jobId, (error:any, jobProgress:IJobProgress) => {
         if (error)
            res.status(400).json({error});
        else
            res.json(jobProgress);       
    });
});

// job info
jobOperationRouter.get('/info', (req: express.Request, res: express.Response) => {
    res.json(getJobInfo(req));
});

// job result
jobOperationRouter.get('/result', (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let jobInfo = getJobInfo(req);
    dispatcher.getJobResult(jobInfo.jobId, (error:any, jobResult:IJobResult) => {
         if (error)
            res.status(400).json({error});
        else
            res.json(jobResult);       
    });
});

// re-submit job
// query:
// 1. failedTasksOnly (optional)
jobOperationRouter.get('/re_submit', canSubmitJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    let jobInfo = getJobInfo(req);
    let query = req.query;
    let fto = query['failedTasksOnly'];
    let failedTasksOnly = (fto ? (isNaN(parseInt(fto)) ? false : parseInt(fto) !== 0) : false);
    dispatcher.reSubmitJob(user, jobInfo.jobId, failedTasksOnly, (error:any, jobProgress:IJobProgress) => {
        if (error)
            res.status(400).json({error});
        else
            res.json(jobProgress);
    });
});

// /task route
jobOperationRouter.use('/task', taskRouter);

function getJobInfoMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
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

router.use('/:jobId', getJobInfoMiddleware, jobOperationRouter);

export {router as Router}; 