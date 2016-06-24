import * as express from 'express';
import * as core from 'express-serve-static-core';
import * as path from 'path';

let router = express.Router();

router.use('/', express.static(path.join(__dirname, '../../public')));

router.get('/test', (req: express.Request, res: express.Response) => {
    res.jsonp({'msg': 'test'});
});

export {router as Router};