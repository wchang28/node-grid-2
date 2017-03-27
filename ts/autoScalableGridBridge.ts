import {IAutoScalableGrid, IWorker, IAutoScalableState} from 'autoscalable-grid';
import {Dispatcher} from './dispatcher';

export class AutoScalableGridBridge implements IAutoScalableGrid {
    constructor(private dispatcher: Dispatcher) {}
    getWorkers(workerIds: string[]): Promise<IWorker[]> {return this.dispatcher.getWorkers(workerIds);}
    requestToTerminateWorkers(workerIds: string[]): Promise<string[]> {
        return Promise.resolve<string[]>(this.dispatcher.requestToTerminateNodes(workerIds));
    }
    setWorkersTerminating(workerIds: string[]): Promise<any> {
        this.dispatcher.setNodesTerminating(workerIds);
        return Promise.resolve<any>({});
    }
    getCurrentState(): Promise<IAutoScalableState> {return Promise.resolve<IAutoScalableState>(this.dispatcher.AutoScalableState);}
}
