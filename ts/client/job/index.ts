import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {Dispatcher} from '../../dispatcher';
import {IUser, IJobProgress} from '../../messaging';

let router = express.Router();

function getUser(req: express.Request): IUser {
    let user:IUser = req["user"];
    return user;
}

function getDispatcher(req:express.Request) : Dispatcher {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

router.post('/submit', (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    dispatcher.submitJob(user, req.body, (err: any, jobId:number) => {
        if (err)
            res.status(400).json({err});
        else
            res.json({jobId});
    });
});

function canKillJob(req: express.Request, res: express.Response, next: express.NextFunction) {
    let jobId:number = req['jobId'];
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    // TODO:
    // return 401
    next();
}

let jobOperationRouter = express.Router();

jobOperationRouter.get('/kill', canKillJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let jobId:number = req['jobId'];
    dispatcher.killJob(jobId, (err: any) => {
        if (err)
            res.status(400).json({err});
        else
            res.json({});
    });
});

jobOperationRouter.get('/status', (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    let jobId:number = req['jobId'];
    dispatcher.getJobProgress(jobId, (err: any, jobProgress: IJobProgress) => {
        if (err)
            res.status(400).json({err});
        else
            res.json(jobProgress);
    });
});

function getJobId(req: express.Request, res: express.Response, next: express.NextFunction) {
    let j:string = req.params['jobId'];
    if (!j)
        res.status(400).json({err: 'bad jobId'});
    else {
        req['jobId'] = parseInt(j);
        next();
    }
}

router.use('/:jobId', getJobId, jobOperationRouter);

export {router as Router};