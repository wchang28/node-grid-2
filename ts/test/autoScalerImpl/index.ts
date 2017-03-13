import {IWorker, IAutoScalerImplementation, IAutoScalableState, WorkerKey, IWorkersLaunchRequest} from 'autoscalable-grid';

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
        let value = (state.CPUDebt * 1.0)/(this.options.CPUsPerWorker * 1.0);
        value *= 0.5;
        let NumInstances = Math.max(Math.round(value), 1);
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

export function factory(options: Options) : IAutoScalerImplementation {
    console.log("I am in the IAutoScalerImplementation factory :-)");
    return new Implementation(options);
}