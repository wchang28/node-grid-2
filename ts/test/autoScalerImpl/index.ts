import {IWorker, IAutoScalerImplementation, IAutoScalableState, WorkerKey, WorkerInstance, IWorkersLaunchRequest} from 'autoscalable-grid';
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {AutoScalerImplementationFactory, AutoScalerImplementationOnChangeHandler, GetAutoScalerImplementationProc} from 'grid-autoscaler-impl-pkg';

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
    LaunchInstances(launchRequest: IWorkersLaunchRequest): Promise<WorkerInstance[]> {
        return Promise.resolve<WorkerInstance[]>(null);
    }
    TerminateInstances (workerKeys: WorkerKey[]): Promise<WorkerInstance[]> {
        return Promise.resolve<WorkerInstance[]>(null);
    }
    getConfigUrl(): Promise<string> {
        return Promise.resolve<string>("autoscaler/implementation");
    }
}

function getImplementation(req: express.Request, getImpl: GetAutoScalerImplementationProc) : Promise<Implementation> {
    return new Promise<Implementation>((resolve: (value: Implementation) => void, reject: (err: any) => void) => {
        getImpl(req)
        .then((impl: IAutoScalerImplementation) => {
            let o: any = impl;
            resolve(o);
        }).catch((err: any) => {
            reject(err);
        });
    });
}

type Handler = (impl: Implementation) => Promise<any>;

function getRequestHandler(getImpl: GetAutoScalerImplementationProc, handler: Handler) : express.RequestHandler {
    return (req: express.Request, res: express.Response) => {
        getImplementation(req, getImpl)
        .then((impl: Implementation) => {
            return handler(impl)
        }).then((ret: any) => {
            res.jsonp(ret);
        }).catch((err: any) => {
            res.status(400).json(err);
        })
    }
}

// factory function
let factory: AutoScalerImplementationFactory = (getImpl: GetAutoScalerImplementationProc, options: Options, onChange: AutoScalerImplementationOnChangeHandler) => {
    let router = express.Router();
    router.get('/config_url', getRequestHandler(getImpl, (impl: Implementation) => {
        return impl.getConfigUrl();
    }));
    return Promise.resolve<[IAutoScalerImplementation, express.Router]>([new Implementation(options), router]);
};

export {factory};
