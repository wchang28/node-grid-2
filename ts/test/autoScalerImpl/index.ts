import {IWorker, IAutoScalerImplementation, IAutoScalableState, WorkerKey, WorkerInstance, IWorkersLaunchRequest, AutoScalerImplementationInfo} from 'autoscalable-grid';
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {ImplementationBase, ConvertToWorkerKeyProc, Options} from 'grid-autoscaler-impl-base';
import {AutoScalerImplementationFactory, AutoScalerImplementationOnChangeHandler, GetAutoScalerImplementationProc} from 'grid-autoscaler-impl-pkg';

class Implementation extends ImplementationBase implements IAutoScalerImplementation {
    constructor(workerToKey: ConvertToWorkerKeyProc, options?: Options) {
        super(workerToKey, options)
    }
    /*
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
    */
    LaunchInstances(launchRequest: IWorkersLaunchRequest): Promise<WorkerInstance[]> {
        return Promise.resolve<WorkerInstance[]>(null);
    }
    TerminateInstances (workerKeys: WorkerKey[]): Promise<WorkerInstance[]> {
        return Promise.resolve<WorkerInstance[]>(null);
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
    router.get('/info', getRequestHandler(getImpl, (impl: Implementation) => {
        return impl.getInfo();
    }));
    let workerToKey: ConvertToWorkerKeyProc = (worker: IWorker) => (worker.RemoteAddress+ ":" + worker.RemotePort.toString());
    return Promise.resolve<[IAutoScalerImplementation, express.Router]>([new Implementation(workerToKey, options), router]);
};

export {factory};
