
import * as events from 'events';

class Nodes extends events.EventEmitter {
    constructor() {
        super();
    }
}

export interface IUser {
    userId: string;
    priority: number;
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
    enqueue(priority:number, tasks: ITaskId[]) : void {
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
    private registerNewJob(user: IUser, job: IJob, done:(err:any, jobId: number) => void): void {
        // TODO:
        done(null, 1);
    }
    submitJob(user: IUser, job: IJob): void {
        this.registerNewJob(user, job, (err:any, jobId: number) => {
            let tasks: ITaskId[] = [];
            for (let i in job.tasks)
                tasks.push({jobId: jobId, taskNo: parseInt(i)});
            this.__queue.enqueue(user.priority, tasks);
        });
    }
    killJob(user:IUser, jobId: number): void {
        
    }
    ackTaskReceived(task: ITaskId): void {

    }
    toJSON(): any {
        return {
           queue:  this.__queue.toJSON()
        };
    }
}