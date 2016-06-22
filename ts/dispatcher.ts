
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

export interface ITaskSummary {
    j: number;
    t: number;
    host: string;
}

export interface INode {
    conn_id: string;
    host: string;
}

export interface INodeItem extends INode {
    enabled: boolean;
    numCPUs: number;
    cpusUsed: number;
}

interface ICPUItem {
    conn_id: string;
}

export interface INodeReady {
    conn_id: string;
    numCPUs: number;
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
    (conn_id: string, task: ITaskItem, done: (err: any) => void) : void;
}

export interface IDispatcherJSON {
    nodes: INodeItem[];
    queueClosed: boolean;
    dispatchEnabled: boolean;
    numTasksInQueue: number;
    dispatching: boolean;
    numOutstandingAcks: number;
} 

interface IInterval {
    lbound: number;
    ubound: number;
}

// will emit the following events
// 1. changed
// 2. more_cpus_available
// 3. node_added
// 4. node_removed
class Nodes extends events.EventEmitter {
    private __nodes: {[conn_id:string]: INodeItem} = {};
    constructor() {
        super();
    }
    // returen true if node is available for task dispatching
    private nodeActive(node: INodeItem): boolean {
        return (node.enabled && node.numCPUs != null);
    }
    incrementCPUUsageCount(conn_id: string) {
        let node = this.__nodes[conn_id];
        if (node) {
            node.cpusUsed++;
            this.emit('changed');
        }
    }
    decrementCPUUsageCount(conn_id: string) {
        let node = this.__nodes[conn_id];
        if (node && node.cpusUsed > 0) {
            node.cpusUsed--;
            this.emit('changed');
            if (this.nodeActive(node))
                this.emit('more_cpus_available');
        }
    }
    enableNode(conn_id: string) : void {
        let node = this.__nodes[conn_id];
        if (node) {
            if (!node.enabled) {
                node.enabled = true;
                this.emit('changed');
                if (this.nodeActive(node)) {
                    this.emit('more_cpus_available');
                }
            }
        }
    }
    disableNode(conn_id: string) : void {
        let node = this.__nodes[conn_id];
        if (node) {
            if (node.enabled) {
                node.enabled = false;
                this.emit('changed');
            }
        }
    }
    addNewNode(newNode: INode) : void {
        if (!this.__nodes[newNode.conn_id]) {
            let node: INodeItem = {
                host: newNode.host
                ,conn_id: newNode.conn_id
                ,numCPUs: null
                ,enabled: true
                ,cpusUsed: 0
            }
            this.__nodes[newNode.conn_id] = node;
            this.emit('changed');
            this.emit('node_added', newNode);
        }
    }
    markNodeReady(conn_id: string, numCPUs: number) : void {
        let node = this.__nodes[conn_id];
        if (node) {
            node.numCPUs = numCPUs;
            this.emit('changed');
            if (this.nodeActive(node)) {
                this.emit('more_cpus_available');
            }
        }        
    }
    // remove the node
    removeNode(conn_id: string) : void {
        let node = this.__nodes[conn_id];
        if (node) {
            delete this.__nodes[conn_id];
            this.emit('changed');
            let removedNode: INode = {
                host: node.host
                ,conn_id: node.conn_id
            };
            this.emit('node_removed', removedNode);
        }
    }
    getAvailableCPUs() : ICPUItem[] {
        let ret: ICPUItem[] = [];
        for (let conn_id in this.__nodes) {    // for each node/host
            let node = this.__nodes[conn_id];
            if (this.nodeActive(node) && node.numCPUs > node.cpusUsed) {
                let availableCPUs = node.numCPUs - node.cpusUsed;
                for (let i:number = 0; i < availableCPUs; i++) {
                    let cpu: ICPUItem = {conn_id: node.conn_id};
                    ret.push(cpu);
                }
            }
        }
        return (ret.length > 0 ? ret : null);
    }
    toJSON(): INodeItem[] {
        let ret: INodeItem[] = [];
        for (let conn_id in this.__nodes)
            ret.push(this.__nodes[conn_id]);
        return ret;
    }
}

// will emit the following events
// 1. changed
// 2. enqueued
class Queue extends events.EventEmitter {
    private __numtasks: number = 0;
    private __queue: {[priority:string]: {[jobId: string]: ITaskItem[]} } = {}; // queue by priority number and jobId
    constructor() {
        super();
    }
    enqueueSingle(priority:number, task: ITaskItem) : void {
        let p = priority.toString();
        if (!this.__queue[p]) this.__queue[p] = {};
        let j = task.j.toString();
        if (!this.__queue[p][j]) this.__queue[p][j] = [];
        this.__queue[p][j].push(task);
        this.__numtasks++;
        this.emit('changed');
        this.emit('enqueued');
        
    }
    enqueue(priority:number, tasks: ITaskItem[]) : void {
        let p = priority.toString();
        if (!this.__queue[p]) this.__queue[p] = {};
        for (let i in tasks) {
            let task = tasks[i];
            let j = task.j.toString();
            if (!this.__queue[p][j]) this.__queue[p][j] = [];
            this.__queue[p][j].push(task);
        }
        this.__numtasks += tasks.length;
        this.emit('changed');
        this.emit('enqueued');
    }

    // generate a number in the interval [min, max)
    private getRandomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
    private chooseByPriority(): number {
        let total:number = 0;
        let lbound: number = 0;
        let intervals: {[p: string] : IInterval} = {};
        for (let p in this.__queue) {
            let priority = parseInt(p);
            total += priority;
            let interval:IInterval = {lbound: lbound, ubound: lbound + priority};
            intervals[p] = interval;
            lbound += priority;
        }
        if (total === 0)    // queue is empty
            return null;
        else {
            let n = this.getRandomInt(0, total);    // choose a number in [0, total)
            for (let p in intervals) {
                let interval = intervals[p];
                if (n >= interval.lbound && n < interval.ubound) {
                    return parseInt(p);
                }
            }
            return null;
        }
    }
    private randomlyPickJob(q: {[jobId: string]: ITaskItem[]}) : number {
        let jobIds:number[];
        for (let j in q) {
            let jobId = parseInt(j);
            jobIds.push(jobId);
        }
        let idx = this.getRandomInt(0, jobIds.length);
        return jobIds[idx];
    }
    dequeue(maxToDequeue: number) : ITaskItemDispatch[] {
        let items: ITaskItemDispatch[] = [];
        while (this.__numtasks > 0 && items.length < maxToDequeue) {
            let priority = this.chooseByPriority();
            let p = priority.toString();
            let jobId = this.randomlyPickJob(this.__queue[p]);
            let j = jobId.toString();
            let ti = this.__queue[p][j].shift();
            if (this.__queue[p][j].length === 0)
                delete this.__queue[p][j];
            if (JSON.stringify(this.__queue[p]) === '{}')
                delete this.__queue[p];
            let task: ITaskItemDispatch = {
                j: ti.j
                ,t: ti.t
                ,r: ti.r
                ,priority: priority
            };
            items.push(task);
            this.__numtasks--;
        }
        if (items.length > 0) {
            this.emit('changed');
            return items;
        } else
            return null;
    }
    toJSON(): IQueueJSON {
        return {numTasks: this.__numtasks};
    }
}

// will emit the following events
// 1. changed
export class Dispatcher extends events.EventEmitter {
    private __queueClosed: boolean = false;
    private __dispatchEnabled: boolean = true;
    private __numOutstandingAcks: number = 0;
    private __nodes: Nodes = new Nodes();
    private __queue: Queue = new Queue();
    constructor(private __taskDispatcher: IHostTaskDispatcher) {
        super();
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

    get queueClosed() : boolean {return this.__queueClosed;}
    set queueClosed(value: boolean) {
        if (this.__queueClosed != value) {
            this.__queueClosed = value;
            this.emit('changed');
        }
    }

    get dispatchEnabled() : boolean {return this.__dispatchEnabled;}
    set dispatchEnabled(value: boolean) {
        if (this.__dispatchEnabled != value) {
            this.__dispatchEnabled = value;
            this.emit('changed');
            if (this.__dispatchEnabled)
                this.dispatchTasksIfNecessary();
        }
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
		// pre-condition:
		// 1. availableCPUs.length > 0
		// 2. numToPick > 0
		// 3. availableCPUs.length >= numToPick
		
		// re-organize cpus by node name
		/////////////////////////////////////////////////////////////////////
		let cpusByHost:{[conn_id:string]:ICPUItem[]} = {};

		for (let i in cpus)	 { // for each available cpu
			let cpu = cpus[i];
			let conn_id = cpu.conn_id;
			if (!cpusByHost[conn_id]) cpusByHost[conn_id] = [];
			cpusByHost[conn_id].push(cpu);
		}
		/////////////////////////////////////////////////////////////////////
		
		// get all the unique host names
		/////////////////////////////////////////////////////////////////////
		var hosts: string[] = [];
		for (var host in cpusByHost)
			hosts.push(host);
		/////////////////////////////////////////////////////////////////////
		
		// randomly shuffle the hosts
		hosts.sort(function() {return 0.5 - Math.random()});
		
		let cpusPicked: ICPUItem[] = [];
		let iter = 0;	// iterator over the node names array
		let i = numToPick;
		while (i > 0) {
			let host = hosts[iter];
			if (cpusByHost[host].length > 0) {
				let cpu = cpusByHost[host].shift();
				cpusPicked.push(cpu);
				i--;
			}
			iter++;
			if (iter == hosts.length) iter = 0;
		}
		return cpusPicked;
    }
    private dispathTaskToNode(conn_id: string, task: ITaskItem, done: (err: any) => void) {
        this.__taskDispatcher(conn_id, task, done);
    }
    private dispatchTasksIfNecessary() : void {
        let availableCPUs: ICPUItem[] = null;
        let tasks: ITaskItemDispatch[] = null;
        if (this.dispatchEnabled && !this.dispatching && (availableCPUs = this.__nodes.getAvailableCPUs()) && (tasks = this.__queue.dequeue(availableCPUs.length))) {
            //assert(availableCPUs.length>0 && tasks.length > 0 && availableCPUs.length >= tasks.length);
            this.setOutstandingAcks(tasks.length);
            let cpusSelected = this.randomlySelectCPUs(availableCPUs, tasks.length);            //assert(cpusSelected.length == tasks.length);
            let getDispatchDoneHandler = (i: number) : (err: any) => void => {
                return (err: any): void => {
                    this.decrementOutstandingAcks();
                    let conn_id = cpusSelected[i].conn_id;
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
                        this.__nodes.incrementCPUUsageCount(conn_id);
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
                this.dispathTaskToNode(cpu.conn_id, task, getDispatchDoneHandler(parseInt(i)));
            }
        }
    }
    private registerNewJob(user: IUser, jobXML: string, done:(err:any, job: IRegisteredJob) => void): void {
        // TODO:
        done(null, {jobId:1, numTasks: 5});
    }
    submitJob(user: IUser, jobXML: string, done:(err:any, jobId: number) => void): void {
        if (this.queueClosed) {
            done('queue is currently closed', null);
        } else {
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
    }
    addNewNode(newNode: INode) : void {this.__nodes.addNewNode(newNode);}
    removeNode(conn_id: string) : void {this.__nodes.removeNode(conn_id);}
    markNodeReady(nodeReady: INodeReady) : void {this.__nodes.markNodeReady(nodeReady.conn_id, nodeReady.numCPUs);}
    onNodeCompleteTask(t: ITaskSummary): void {
        this.__nodes.decrementCPUUsageCount(t.host);
        // TODO:
    }
    killJob(jobId: number): void {
    }
    toJSON(): IDispatcherJSON {
        return {
            nodes: this.__nodes.toJSON()
            ,queueClosed: this.queueClosed
            ,dispatchEnabled: this.dispatchEnabled
            ,numTasksInQueue: this.__queue.toJSON().numTasks
            ,dispatching: this.dispatching
            ,numOutstandingAcks: this.__numOutstandingAcks
        };
    }
}