import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGridUser} from '../../messaging';

let router = express.Router();

function getUser(req: express.Request): IGridUser {
    let user:IGridUser = req["user"];
    return user;
}

router.get('/me', (req: express.Request, res: express.Response) => {
    res.json(getUser(req));
});

export {router as Router}; 