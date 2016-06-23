import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IUser} from '../messaging';

let router = express.Router();

function getUser(req: express.Request): IUser {
    let user:IUser = req["user"];
    return user;
}

router.get('/submit_job', (req: express.Request, res: express.Response) => {
    res.json({});
});

export {router as Router};