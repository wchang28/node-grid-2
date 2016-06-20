
import * as events from 'events';

class Nodes extends events.EventEmitter {
    constructor() {
        super();
    }
}

export interface ITask {
    cmd: string;
    cookie?: string
}

export interface IJob {
    tasks: ITask[];
    description?: string;
    cookie?: string;
} 

export interface ITaskId {
    jobId: number;
    taskNo: number;
}

interface QueueItem {
    task: ITaskId;
}

class Queue extends events.EventEmitter {
    private _queue: QueueItem[] = [];
    constructor() {
        super();
    }
    enqueue(tasks: ITaskId[]) : void {
        this.emit('enqueued');
        this.emit('changed');
    }
    toJSON(): any {
        return {};
    }
}

export class Dispatcher extends events.EventEmitter {
    private __nodes: Nodes;
    private __queue: Queue;
    constructor() {
        super();
        this.__queue = new Queue();
        this.__queue.on('enqueued', () => {
            // dispatch if necessary
        });
        this.__queue.on('changed', () => {
            this.emit('changed');
        });
    }
    submitJob(user:any, job: IJob): void {
        let tasks: ITaskId[] = [];
        for (let i in job.tasks)
            tasks.push({jobId: 1, taskNo: parseInt(i)});
        this.__queue.enqueue(tasks);
    }
    killJob(user:any, jobId: number): void {
        
    }
    ackTaskReceived(task: ITaskId): void {

    }
    toJSON(): any {
        return {
           queue:  this.__queue.toJSON()
        };
    }
}