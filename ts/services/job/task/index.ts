// route /services/job/{jobId}/task
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../../global';
import {Dispatcher} from '../../../dispatcher';
import {IJobInfo, ITaskResult} from 'grid-client-core';
import * as errors from '../../../errors';

let router = express.Router();

function getDispatcher(req:express.Request) : Dispatcher {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

let getJobInfo = (req: express.Request): IJobInfo => {
    return req['jobInfo'];
}

// task operation/method invoke router
let taskOperationRouter = express.Router();

let getTaskResult = (req: express.Request): ITaskResult => {
    return req['taskResult'];
}

taskOperationRouter.get('/', (req: express.Request, res: express.Response) => {
    res.json(getTaskResult(req));
});

function getTaskResultMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    let jobInfo = getJobInfo(req);
    let taskIndex:string = req.params['taskIndex'];
    let t: number = parseInt(taskIndex);
    if (isNaN(t) || t < 0 || t >= jobInfo.numTasks)
        res.status(400).json(errors.bad_task_index);
    else {
        let dispatcher = getDispatcher(req);
        dispatcher.getTaskResult({j: jobInfo.jobId, t}, (error:any, taskResult: ITaskResult) => {
            if (error)
                res.status(400).json({error});
            else {
                req['taskResult'] = taskResult;
                next();
            }
        });
    }
}

router.use('/:taskIndex', getTaskResultMiddleware, taskOperationRouter);

export {router as Router};
