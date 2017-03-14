import {IWorker, IAutoScalerImplementation, IAutoScalableState, WorkerKey, IWorkersLaunchRequest} from 'autoscalable-grid';
import * as express from 'express';
import * as core from 'express-serve-static-core';

export interface Options {
    CPUsPerWorker: number;
}

class Implementation implements IAutoScalerImplementation {
    constructor(private options: Options) {}
    TranslateToWorkerKeys(workers: IWorker[]): Promise<WorkerKey[]> {
        let workerKeys: WorkerKey[] = [];
        for (let i in workers) {
            let worker = workers[i];
            let workerKey = worker.RemoteAddress+ ":" + worker.RemotePort.toString();
            workerKeys.push(workerKey);
        }
        return Promise.resolve<WorkerKey[]>(workerKeys);
    }
    EstimateWorkersLaunchRequest(state: IAutoScalableState): Promise<IWorkersLaunchRequest> {
        let NumInstances = (state.CPUDebt * 1.0)/(this.options.CPUsPerWorker * 1.0);
        NumInstances = Math.max(Math.round(NumInstances), 1);
        return Promise.resolve<IWorkersLaunchRequest>({NumInstances});
    }
    LaunchInstances(launchRequest: IWorkersLaunchRequest): Promise<WorkerKey[]> {
        return Promise.resolve<WorkerKey[]>(null);
    }
    TerminateInstances (workerKeys: WorkerKey[]): Promise<WorkerKey[]> {
        return Promise.resolve<WorkerKey[]>(null);
    }
    getConfigUrl(): Promise<string> {
        return Promise.resolve<string>("https://www.google.com/");
    }
}

export function factory(options: Options) : Promise<IAutoScalerImplementation> {
    return Promise.resolve<IAutoScalerImplementation>(new Implementation(options));
}

export type GetAutoScalerImplementationProc = (req: express.Request) => Promise<IAutoScalerImplementation>;

function getImplementation(req: express.Request, getImplProc: GetAutoScalerImplementationProc) : Promise<Implementation> {
    return new Promise<Implementation>((resolve: (value: Implementation) => void, reject: (err: any) => void) => {
        getImplProc(req)
        .then((impl: IAutoScalerImplementation) => {
            let o: any = impl;
            resolve(o);
        }).catch((err: any) => {
            reject(err);
        });
    });
}

type Handler = (impl: Implementation) => Promise<any>;

function getRequestHandler(getImplProc: GetAutoScalerImplementationProc, handler: Handler) : express.RequestHandler {
    return (req: express.Request, res: express.Response) => {
        getImplementation(req, getImplProc)
        .then((impl: Implementation) => {
            return handler(impl)
        }).then((ret: any) => {
            res.jsonp(ret);
        }).catch((err: any) => {
            res.status(400).json(err);
        })
    }
}

export function routerFactory(getImplProc: GetAutoScalerImplementationProc) : Promise<express.Router> {
    let router = express.Router();
    router.get('/config_url', getRequestHandler(getImplProc, (impl: Implementation) => {
        return impl.getConfigUrl();
    }));
    return Promise.resolve<express.Router>(router);
}