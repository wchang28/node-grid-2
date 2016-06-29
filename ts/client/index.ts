import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../global';
import {Dispatcher} from '../dispatcher';
import {IUser} from '../messaging';

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

router.post('/submit_job', (req: express.Request, res: express.Response) => {
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
    let dispatcher = getDispatcher(req);
    let user = getUser(req);
    // TODO:
    // return 401
    next();
}

router.get('/kill_job', canKillJob, (req: express.Request, res: express.Response) => {
    let dispatcher = getDispatcher(req);
    dispatcher.killJob(req.query.jobId, (err: any) => {
        if (err)
            res.status(400).json({err});
        else
            res.json({});
    });
});

export {router as Router};