
import * as events from 'events';
import {INode, INodeReady, ITask, IUser, IJobProgress, IRunningProcessByNode} from './messaging';

interface ITaskItem extends ITask {
    r?: number; // number of retries
}

export interface INodeItem extends INode {
    enabled: boolean;
    numCPUs: number;
    cpusUsed: number;
}

interface ICPUItem {
    nodeId: string;
}

interface ITaskItemDispatch extends ITaskItem {
    priority: number;  // priority
}

interface IQueueJSON {
    numTasks: number;
}

export interface INodeMessaging {
    dispatchTaskToNode: (nodeId: string, task: ITask, done: (err: any) => void) => void;
    killProcessesTree: (nodeId: string, pids:number[], done: (err: any) => void) => void;
}

export interface IJobDB {
    registerNewJob: (user: IUser, jobXML: string, done:(err:any, jobProgress: IJobProgress) => void) => void;
    getJobProgress: (jobId: number, done:(err:any, jobProgress: IJobProgress) => void) => void;
    killJob: (jobId:number, markJobAborted: boolean, done:(err:any, runningProcess: IRunningProcessByNode) => void) => void;
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

interface IKillJobCall {
    ():void
}

interface IKillJobCallFactory {
    (jobId:number, markJobAborted: boolean, waitMS:number, maxTries:number, tryIndex: number, done: (err: any) => void) : IKillJobCall
}

// will emit the following events
// 1. changed
// 2. more_cpus_available
// 3. node_added
// 4. node_removed
class Nodes extends events.EventEmitter {
    private __nodes: {[id:string]: INodeItem} = {};
    constructor() {
        super();
    }
    // returen true if node is available for task dispatching
    private nodeActive(node: INodeItem): boolean {
        return (node.enabled && typeof node.numCPUs === 'number' && node.numCPUs > 0);
    }
    incrementCPUUsageCount(id: string) {
        let node = this.__nodes[id];
        if (node) {
            node.cpusUsed++;
            this.emit('changed');
        }
    }
    decrementCPUUsageCount(id: string) {
        let node = this.__nodes[id];
        if (node && node.cpusUsed > 0) {
            node.cpusUsed--;
            this.emit('changed');
            if (this.nodeActive(node))
                this.emit('more_cpus_available');
        }
    }
    enableNode(id: string) : void {
        let node = this.__nodes[id];
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
    disableNode(id: string) : void {
        let node = this.__nodes[id];
        if (node) {
            if (node.enabled) {
                node.enabled = false;
                this.emit('changed');
            }
        }
    }
    addNewNode(newNode: INode) : void {
        if (!this.__nodes[newNode.id]) {
            let node: INodeItem = {
                name: newNode.name
                ,id: newNode.id
                ,numCPUs: null
                ,enabled: true
                ,cpusUsed: 0
            }
            this.__nodes[newNode.id] = node;
            this.emit('changed');
            this.emit('node_added', newNode);
        }
    }
    markNodeReady(id: string, nodeReady: INodeReady) : void {
        let node = this.__nodes[id];
        if (node) {
            node.numCPUs = nodeReady.numCPUs;
            if (nodeReady.name) node.name = nodeReady.name;
            this.emit('changed');
            if (this.nodeActive(node)) {
                this.emit('more_cpus_available');
            }
        }        
    }
    // remove the node
    removeNode(id: string) : void {
        let node = this.__nodes[id];
        if (node) {
            delete this.__nodes[id];
            this.emit('changed');
            let removedNode: INode = {
                id: node.id
                ,name: node.name
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
                    let cpu: ICPUItem = {nodeId: node.id};
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
        let jobIds:number[] = [];
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
    clear() {
        let ps: string[] = [];
        for (let p in this.__queue)   // for each priority
            ps.push(p);
        for (let i in ps) {   // for each priority
            let p = ps[i];
            delete this.__queue[p];
        }
        this.__numtasks = 0;
        if (ps.length > 0) this.emit('changed');
    }
    clearJobTasks(jobId: number) {
        let j:string = jobId.toString();
        let numRemoved:number = 0;
        for (let p in this.__queue) {   // for each priority
            if (this.__queue[p][j]) {   // found the job
                numRemoved = this.__queue[p][j].length;
                delete this.__queue[p][j];
                if (JSON.stringify(this.__queue[p]) === '{}')
                    delete this.__queue[p];
                break;
            }
        }
        this.__numtasks -= numRemoved;
        if (numRemoved > 0) this.emit('changed');
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
    constructor(private __nodeMessaging: INodeMessaging, private __jobDB: IJobDB) {
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
		
		// re-organize cpus by node
		/////////////////////////////////////////////////////////////////////
		let cpusByHost:{[nodeId:string]:ICPUItem[]} = {};

		for (let i in cpus)	 { // for each available cpu
			let cpu = cpus[i];
			let nodeId = cpu.nodeId;
			if (!cpusByHost[nodeId]) cpusByHost[nodeId] = [];
			cpusByHost[nodeId].push(cpu);
		}
		/////////////////////////////////////////////////////////////////////
		
		// get all the unique node ids
		/////////////////////////////////////////////////////////////////////
		var nodes: string[] = [];
		for (var nodeId in cpusByHost)
			nodes.push(nodeId);
		/////////////////////////////////////////////////////////////////////
		
		// randomly shuffle the nodes
		nodes.sort(function() {return 0.5 - Math.random()});
		
		let cpusPicked: ICPUItem[] = [];
		let iter = 0;	// iterator over the node names array
		let i = numToPick;
		while (i > 0) {
			let nodeId = nodes[iter];
			if (cpusByHost[nodeId].length > 0) {
				let cpu = cpusByHost[nodeId].shift();
				cpusPicked.push(cpu);
				i--;
			}
			iter++;
			if (iter == nodes.length) iter = 0;
		}
		return cpusPicked;
    }
    private dispathTaskToNode(nodeId: string, task: ITaskItem, done: (err: any) => void) {
        this.__nodeMessaging.dispatchTaskToNode(nodeId, task, done);
    }
    private dispatchTasksIfNecessary() : void {
        let availableCPUs: ICPUItem[] = null;
        let tasks: ITaskItemDispatch[] = null;
        if (this.dispatchEnabled && !this.dispatching && (availableCPUs = this.__nodes.getAvailableCPUs()) && (tasks = this.__queue.dequeue(availableCPUs.length))) {
            //assert(availableCPUs.length>0 && tasks.length > 0 && availableCPUs.length >= tasks.length);
            this.setOutstandingAcks(tasks.length);
            let cpusSelected = this.randomlySelectCPUs(availableCPUs, tasks.length);            //assert(cpusSelected.length == tasks.length);
            //console.log('availableCPUs.length=' + availableCPUs.length + ', tasks.length=' +  tasks.length + ', cpusSelected.length=' + cpusSelected.length);
            let getDispatchDoneHandler = (i: number) : (err: any) => void => {
                return (err: any): void => {
                    let nodeId = cpusSelected[i].nodeId;
                    let task = tasks[i];
                    if (err) {
                        this.decrementOutstandingAcks();
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
                        this.__nodes.incrementCPUUsageCount(nodeId);
                        this.decrementOutstandingAcks();
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
                this.dispathTaskToNode(cpu.nodeId, task, getDispatchDoneHandler(parseInt(i)));
            }
        }
    }
    submitJob(user: IUser, jobXML: string, done:(err:any, jobId: number) => void): void {
        if (this.queueClosed) {
            done('queue is currently closed', null);
        } else {
            this.__jobDB.registerNewJob(user, jobXML, (err:any, jobProgress: IJobProgress) => {
                if (!err) {
                    // TODO: added to tracked jobs
                    let tasks: ITaskItem[] = [];
                    for (let i:number = 0; i < jobProgress.numTasks; i++)
                        tasks.push({j: jobProgress.jobId, t: i});
                    this.__queue.enqueue(user.priority, tasks);
                    done(null, jobProgress.jobId);
                } else {
                    done(err, null);
                }
            });
        }
    }
    addNewNode(newNode: INode) : void {this.__nodes.addNewNode(newNode);}
    removeNode(nodeId: string) : void {this.__nodes.removeNode(nodeId);}
    markNodeReady(nodeId: string, nodeReady: INodeReady) : void {this.__nodes.markNodeReady(nodeId, nodeReady);}
    onNodeCompleteTask(nodeId: string, task: ITask): void {
        this.__nodes.decrementCPUUsageCount(nodeId);
        let jobId = task.j;
        this.__jobDB.getJobProgress(jobId, (err:any, jobProgress: IJobProgress) => {
            if (err) {
                console.log('!!! Error getting job progress for job ' + jobId.toString() + ': ' + JSON.stringify(err));
            } else {
                // TODO:
            }
        });
    }
    getJobProgress(jobId: number, done:(err:any, jobProgress: IJobProgress) => void): void {
        this.__jobDB.getJobProgress(jobId, done);
    }
    killJob(jobId: number, done: (err: any) => void): void {
        console.log('killing job ' + jobId.toString() + '...');
        this.__queue.clearJobTasks(jobId);
        let getKillJobCall : IKillJobCallFactory = (jobId:number, markJobAborted: boolean, waitMS:number, maxTries:number, tryIndex: number, done: (err: any) => void) : IKillJobCall => {
            return () : void => {
                console.log('job ' + jobId.toString() + ' kill poll #' + (tryIndex+1).toString() + '...');
                this.__jobDB.killJob(jobId, markJobAborted, (err: any, runningProcess: IRunningProcessByNode) => {
                    if (err)
                        done(err);
                    else {
                        if (JSON.stringify(runningProcess) === '{}')    // no more process running
                            done(null);
                        else {  // there are tasks still running
                            for (let nodeId in runningProcess) {    // for each node
                                let pids = runningProcess[nodeId];
                                this.__nodeMessaging.killProcessesTree(nodeId, pids, (err: any): void => {});
                            }
                            if (tryIndex < maxTries-1)
                                setTimeout(getKillJobCall(jobId, false, waitMS, maxTries, tryIndex+1, done), waitMS);
                            else
                                done('kill poll max-out');
                        }
                    }
                });
            }
        }
        getKillJobCall(jobId, true, 3000, 5, 0, (err: any) => {
            console.log('job ' + jobId.toString() + ' kill process finished.' + (err ? ' error=' + JSON.stringify(err) : ' job was killed successfully :-)'));
            done(err);
        })();
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