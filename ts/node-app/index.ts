import * as express from 'express';
import * as core from 'express-serve-static-core';

import {ITaskItem} from "../dispatcher";
import {IGlobal} from '../global'; 

let router = express.Router();

//console.log('I am here');

/*
router.get('ack_task_received', (req: express.Request, res: express.Response) => {
    let task: ITaskItem = req['body'];
    let g: IGlobal = req.app.get("global");
    let dispatcher = g.dispatcher;
});
*/

export = router;