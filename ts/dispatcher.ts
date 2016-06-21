
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
    host: string;
    numCPUs: number;
}

export interface INodeItem extends INode {
    enabled: boolean;
    cpusUsed: number;
    ready: boolean;
    leavePending: boolean;
}

interface ICPUItem {
    host: string
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

export interface IHostTaskDispatcher {
    (host: string, task: ITaskItem, done: (err: any) => void) : void;
}

export interface IDispatcherJSON {
    nodes: INodeItem[];
    numTasksInQueue: number;
    dispatching: boolean;
    numOutstandingAcks: number;
} 

// will emit the following events
// 1. changed
// 2. more_cpus_available
// 3. node_added
// 4. node_removed
class Nodes extends events.EventEmitter {
    private __nodes: {[host:string]: INodeItem} = {};
    constructor() {
        super();
    }
    // returen true if node is available for task dispatching
    private nodeActive(node: INodeItem): boolean {
        return (node.enabled && node.ready && !node.leavePending);
    }
    incrementCPUUsageCount(host: string) {
        let node = this.__nodes[host];
        if (node) {
            node.cpusUsed++;
            this.emit('changed');
        }
    }
    decrementCPUUsageCount(host: string) {
        let node = this.__nodes[host];
        if (node && node.cpusUsed > 0) {
            node.cpusUsed--;
            this.emit('changed');
            if (node.cpusUsed === 0 && node.leavePending) {
                delete this.__nodes[host];
                this.emit('changed');
                this.emit('node_removed', host);
            } else if (this.nodeActive(node))
                this.emit('more_cpus_available');
        }
    }
    markNodeLeavePending(host: string) {
        let node = this.__nodes[host];
        if (node) {
            if (node.cpusUsed === 0) {
                delete this.__nodes[host];
                this.emit('changed');
                this.emit('node_removed', host);
            } else {
                node.enabled = false;
                node.leavePending = true;
                this.emit('changed');
            }
        }
    }
    enableNode(host: string) : void {
        let node = this.__nodes[host];
        if (node) {
            let changed: boolean = false;
            if (!node.enabled) {
                node.enabled = true;
                changed = true;
            }
            if (node.leavePending) {
                node.leavePending = false;
                changed = true;
            }
            if (changed) {
                this.emit('changed');
                if (this.nodeActive(node)) {
                    this.emit('more_cpus_available');
                }
            }
        }
    }
    disableNode(host: string) : void {
        let node = this.__nodes[host];
        if (node) {
            if (node.enabled) {
                node.enabled = false;
                this.emit('changed');
            }
        }
    }
    addNewNode(newNode: INode) : void {
        if (!this.__nodes[newNode.host]) {
            let node: INodeItem = {
                host: newNode.host
                ,numCPUs: newNode.numCPUs
                ,enabled: true
                ,cpusUsed: 0
                ,ready: false
                ,leavePending: false
            }
            this.__nodes[newNode.host] = node;
            this.emit('changed');
            this.emit('node_added', newNode.host);
        }
    }
    markNodeReady(host: string) : void {
        let node = this.__nodes[host];
        if (node) {
            node.ready = true;
            this.emit('changed');
            if (this.nodeActive(node)) {
                this.emit('more_cpus_available');
            }
        }        
    }
    // remove the node forcefully without checking the cpu usage
    removeNode(host: string) : void {
        let node = this.__nodes[host];
        if (node) {
            delete this.__nodes[host];
            this.emit('changed');
            this.emit('node_removed', host);
        }
    }
    getAvailableCPUs() : ICPUItem[] {
        let ret: ICPUItem[] = [];
        for (let host in this.__nodes) {    // for each node/host
            let node = this.__nodes[host];
            if (this.nodeActive(node) && node.numCPUs > node.cpusUsed) {
                let availableCPUs = node.numCPUs - node.cpusUsed;
                for (let i:number = 0; i < availableCPUs; i++) {
                    let cpu: ICPUItem = {host: host};
                    ret.push(cpu);
                }
            }
        }
        return (ret.length > 0 ? ret : null);
    }
    toJSON(): INodeItem[] {
        let ret: INodeItem[] = [];
        for (let host in this.__nodes)
            ret.push(this.__nodes[host]);
        return ret;
    }
}

// will emit the following events
// 1. changed
// 2. enqueued
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
        return (items.length > 0 ? items : null);
    }
    toJSON(): IQueueJSON {
        return {numTasks: this.__numtasks};
    }
}

export class Dispatcher extends events.EventEmitter {
    private __numOutstandingAcks: number = 0;
    private __nodes: Nodes;
    private __queue: Queue;
    constructor(private __taskDispatcher: IHostTaskDispatcher) {
        super();
        this.__queue = new Queue();
        this.__queue.on('enqueued', () => {
            this.dispatchTasksIfNecessary();
        });
        this.__queue.on('changed', () => {
            this.emit('changed');
        });
        this.__nodes.on('changed', () => {
            this.emit('changed');
        });
        this.__nodes.on('more_cpus_available', () => {
            this.dispatchTasksIfNecessary();
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
    private dispathTaskToNode(host: string, task: ITaskItem, done: (err: any) => void) {
        this.__taskDispatcher(host, task, done);
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
                    let host = cpusSelected[i].host;
                    let task = tasks[i];
                    if (err) {
                        // TODO: emit dispatch error event
                        if (task.r < 3) {
                            let t: ITaskItem = {
                                j: task.j
                                ,t: task.t
                                ,r: task.r
                            }
                            this.__queue.enqueueSingle(task.priority, t);
                        }
                    } else {    // task successful dispatched
                        this.__nodes.incrementCPUUsageCount(host);
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
    submitJob(user: IUser, jobXML: string, done:(err:any, jobId: number) => void): void {
        this.registerNewJob(user, jobXML, (err:any, job: IRegisteredJob) => {
            if (!err) {
                let tasks: ITaskItem[] = [];
                for (let i:number = 0; i < job.numTasks; i++)
                    tasks.push({j: job.jobId, t: i});
                this.__queue.enqueue(user.priority, tasks);
                // TODO: added to tracked jobs
                done(null, job.jobId);
            } else {
                done(err, null);
            }
        });
    }
    killJob(jobId: number): void {
    }
    ackTaskReceived(task: ITaskItem): void {

    }
    toJSON(): IDispatcherJSON {
        return {
            nodes: this.__nodes.toJSON()
            ,numTasksInQueue: this.__queue.toJSON().numTasks
            ,dispatching: this.dispatching
            ,numOutstandingAcks: this.__numOutstandingAcks
        };
    }
}