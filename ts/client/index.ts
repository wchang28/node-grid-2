import * as express from 'express';
import * as core from 'express-serve-static-core';
import {Router as jobRouter} from './job';

let router = express.Router();
router.use('/job', jobRouter);

export {router as Router};