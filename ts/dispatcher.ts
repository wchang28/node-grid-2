
import * as events from 'events';

export interface IUser {
    userId: string;
    priority: number;
}

export interface ITaskItem {
    j: number;
    t: number;
    r?: number; // number of retries
}

export interface INode {

}

interface ICPUItem {
    host: string
}

class Nodes extends events.EventEmitter {
    constructor() {
        super();
    }
    getAvailableCPUs() : ICPUItem[] {
        // TODO:
        return null;
    }
}

interface IRegisteredJob {
    jobId: number;
    numTasks: number;
} 

interface ITaskItemDispatch extends ITaskItem {
    priority: number;  // priority
}

interface IQueueJSON {
    numTasks: number;
}

export interface IDispatcherJSON {
    numTasksInQueue: number;
    dispatching: boolean;
    numOutstandingAcks: number;
} 

class Queue extends events.EventEmitter {
    private __numtasks: number = 0;
    private __queue: {[priority:number]: ITaskItem[]} = {}; // queue by priority number
    constructor() {
        super();
    }
    enqueueSingle(priority:number, task: ITaskItem) : void {
        if (!this.__queue[priority]) this.__queue[priority] = [];
        this.__queue[priority].push(task);
        this.__numtasks++;
        this.emit('changed');
        this.emit('enqueued');
        
    }
    enqueue(priority:number, tasks: ITaskItem[]) : void {
        if (!this.__queue[priority]) this.__queue[priority] = [];
        for (let i in tasks)
            this.__queue[priority].push(tasks[i]);
        this.__numtasks += tasks.length;
        this.emit('changed');
        this.emit('enqueued');
    }
    dequeue(maxToDequeue: number) : ITaskItemDispatch[] {
        let items: ITaskItemDispatch[] = [];
        // TODO: this.__numtasks -=
        return (items.length === 0 ? null : items);
    }
    toJSON(): IQueueJSON {
        return {numTasks: this.__numtasks};
    }
}

export class Dispatcher extends events.EventEmitter {
    private __numOutstandingAcks: number = 0;
    private __nodes: Nodes;
    private __queue: Queue;
    constructor() {
        super();
        this.__queue = new Queue();
        this.__queue.on('enqueued', () => {
            this.dispatchTasksIfNecessary();
        });
        this.__queue.on('changed', () => {
            this.emit('changed');
        });
    }

    get dispatching(): boolean {return this.__numOutstandingAcks > 0;}

    private setOutstandingAcks(value: number) : void {
        if (this.__numOutstandingAcks !== value) {
            this.__numOutstandingAcks = value;
            this.emit('changed');
        }
    }
    private decrementOutstandingAcks() : void {
        if (this.__numOutstandingAcks > 0) {
            this.__numOutstandingAcks--;
            this.emit('changed');
        }
        if (this.__numOutstandingAcks === 0) {
            this.dispatchTasksIfNecessary();
        }
    }

    private randomlySelectCPUs(cpus: ICPUItem[], numToPick: number) : ICPUItem[] {
        // TODO:
        return null;
    }
    private dispathTaskToNode(host: string, task: ITaskItemDispatch, done: (err: any) => void) {
        // TODO:
    }
    private dispatchTasksIfNecessary() : void {
        let availableCPUs: ICPUItem[] = null;
        let tasks: ITaskItemDispatch[] = null;
        if (!this.dispatching && (availableCPUs = this.__nodes.getAvailableCPUs()) && (tasks = this.__queue.dequeue(availableCPUs.length))) {
            //assert(availableCPUs.length>0 && tasks.length > 0 && availableCPUs.length >= tasks.length);
            this.setOutstandingAcks(tasks.length);
            let cpusSelected = this.randomlySelectCPUs(availableCPUs, tasks.length);
            //assert(cpusSelected.length == tasks.length);
            let getDispatchDoneHandler = (i: number) : (err: any) => void => {
                return (err: any): void => {
                    this.decrementOutstandingAcks();
                    if (err) {
                        let host = cpusSelected[i].host;
                        let task = tasks[i];
                        // TODO: emit dispatch error event
                        if (task.r < 3) {
                            let t: ITaskItem = {
                                j: task.j
                                ,t: task.t
                                ,r: task.r
                            }
                            this.__queue.enqueueSingle(task.priority, t);
                        }
                    }
                }
            }
            for (let i in tasks) {
                let task = tasks[i];
                let cpu = cpusSelected[i];
                if (!task.r)
                    task.r = 1;
                else
                    task.r++;
                this.dispathTaskToNode(cpu.host, task, getDispatchDoneHandler(parseInt(i)));
            }
        }
    }
    private registerNewJob(user: IUser, jobXML: string, done:(err:any, job: IRegisteredJob) => void): void {
        // TODO:
        done(null, {jobId:1, numTasks: 5});
    }
    submitJob(user: IUser, jobXML: string): void {
        this.registerNewJob(user, jobXML, (err:any, job: IRegisteredJob) => {
            let tasks: ITaskItem[] = [];
            for (let i = 0; i < job.numTasks; i++)
                tasks.push({j: job.jobId, t: i});
            this.__queue.enqueue(user.priority, tasks);
        });
    }
    killJob(user:IUser, jobId: number): void {
        
    }
    ackTaskReceived(task: ITaskItem): void {

    }
    toJSON(): IDispatcherJSON {
        return {
           numTasksInQueue:  this.__queue.toJSON().numTasks
           ,dispatching: this.dispatching
           ,numOutstandingAcks: this.__numOutstandingAcks
        };
    }
}