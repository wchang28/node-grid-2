
import * as events from 'events';
import {INode, INodeReady, ITask, IGridUser, IJobProgress, IJobInfo, IJobTrackItem, IRunningProcessByNode} from './messaging';

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

export interface IQueueJSON {
    priorities: number[];
    numJobs: number;
    numTasks: number;
}

export interface INodeMessaging {
    dispatchTaskToNode: (nodeId: string, task: ITask, done: (err: any) => void) => void;
    killProcessesTree: (nodeId: string, pids:number[], done: (err: any) => void) => void;
}

export interface IGridDB {
    registerNewJob: (user: IGridUser, jobXML: string, done:(err:any, jobProgress: IJobProgress) => void) => void;
    reSubmitJob: (user: IGridUser, oldJobId: string, failedTasksOnly: boolean, done:(err:any, jobProgress: IJobProgress) => void) => void;
    getJobProgress: (jobId: string, done:(err:any, jobProgress: IJobProgress) => void) => void;
    getMultiJobsProgress: (jobIds:string[], done:(err:any, jobsProgress: IJobProgress[]) => void) => void;
    getJobInfo: (jobId: string, done:(err:any, jobInfo: IJobInfo) => void) => void;
    killJob: (jobId:string, markJobAborted: boolean, done:(err:any, runningProcess: IRunningProcessByNode, jobProgress: IJobProgress) => void) => void;
}

export interface IJobsStatusPollingJSON {
    numJobs: number;
    started: boolean; 
}

export interface IDispatcherJSON {
    nodes: INodeItem[];
    queueClosed: boolean;
    queue: IQueueJSON;
    dispatchEnabled: boolean;
    dispatching: boolean;
    numOutstandingAcks: number;
    numTrackingJobs: number;
    jobsPolling: IJobsStatusPollingJSON;
} 

interface IInterval {
    lbound: number;
    ubound: number;
}

interface IKillJobCall {
    ():void
}

interface IKillJobCallFactory {
    (jobId:string, markJobAborted: boolean, waitMS:number, maxTries:number, tryIndex: number, done: (err: any) => void) : IKillJobCall
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
    getNode(id:string): INodeItem {
        let node = this.__nodes[id];
        return (node ? node : null);
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
    private __numJobs: number = 0;
    private __queue: {[priority:string]: {[jobId: string]: ITaskItem[]} } = {}; // queue by priority number and jobId
    constructor() {
        super();
    }
    enqueueSingle(priority:number, task: ITaskItem) : void {
        let p = priority.toString();
        if (!this.__queue[p]) this.__queue[p] = {};
        let jobId = task.j;
        if (!this.__queue[p][jobId]) {
            this.__queue[p][jobId] = [];
            this.__numJobs++;
        }
        this.__queue[p][jobId].push(task);
        this.__numtasks++;
        this.emit('changed');
        this.emit('enqueued');
        
    }
    enqueue(priority:number, tasks: ITaskItem[]) : void {
        let p = priority.toString();
        if (!this.__queue[p]) this.__queue[p] = {};
        for (let i in tasks) {  // for each task
            let task = tasks[i];
            let jobId = task.j;
            if (!this.__queue[p][jobId]) {
                this.__queue[p][jobId] = [];
                this.__numJobs++;
            }
            this.__queue[p][jobId].push(task);
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
    // randomly pick a job from the priority queue
    private randomlyPickAJob(q: {[jobId: string]: ITaskItem[]}) : string {
        let jobIds:string[] = [];
        for (let jobId in q) {
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
            let jobId = this.randomlyPickAJob(this.__queue[p]);
            let ti = this.__queue[p][jobId].shift();
            if (this.__queue[p][jobId].length === 0) {
                delete this.__queue[p][jobId];
                this.__numJobs--;
            }
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
        this.__numJobs = 0;
        this.__numtasks = 0;
        if (ps.length > 0) this.emit('changed');
    }
    clearJobTasks(jobId: string) {
        let numRemoved:number = 0;
        for (let p in this.__queue) {   // for each priority
            if (this.__queue[p][jobId]) {   // found the job
                numRemoved = this.__queue[p][jobId].length;
                delete this.__queue[p][jobId];
                this.__numJobs--;
                if (JSON.stringify(this.__queue[p]) === '{}')
                    delete this.__queue[p];
                break;
            }
        }
        this.__numtasks -= numRemoved;
        if (numRemoved > 0) this.emit('changed');
    }
    toJSON(): IQueueJSON {
        let priorities: number[] = [];
        for (let p in this.__queue)
            priorities.push(parseInt(p));
        priorities.sort();
        return {
            priorities: priorities
            ,numJobs: this.__numJobs
            ,numTasks: this.__numtasks
        };
    }
}

// will emit the following events
// 1. change
// 2. job_added
// 3. job_removed
// 4. job_status_changed
class JobsTracker extends events.EventEmitter {
    private __trackItems: {[jobId: string]: IJobTrackItem} = {};
    private __numJobs: number = 0;
    private __statusSeqNumbers: {[status:string]: number} = {
        'SUBMITTED': 0
        ,'STARTED': 1
        ,'FINISHED': 2
        ,'ABORTED': 2
    };
    constructor() {
        super();
    }
    addJob(jobProgress: IJobProgress, notificationCookie:string = null) : void {
        if (!this.__trackItems[jobProgress.jobId]) {
            let trackItem:IJobTrackItem = {
                jp: jobProgress
                ,ncks: (notificationCookie ? [notificationCookie] : null)
            };
            this.__trackItems[jobProgress.jobId] = trackItem;
            this.__numJobs++;
            this.emit('job_added', jobProgress.jobId);
            this.emit('change');
            this.emit('job_status_changed', trackItem);
        }
    }
    addNotificationToJob(jobId:number, notificationCookie:string) : void {
        if (this.__trackItems[jobId]) {
            if (!this.__trackItems[jobId].ncks) this.__trackItems[jobId].ncks = [];
            this.__trackItems[jobId].ncks.push(notificationCookie);
            this.emit('change');
        }
    }
    private jobTransition(oldJP: IJobProgress, newJP: IJobProgress) : IJobProgress {
        let oldStatus = oldJP.status;
        let oldStatusSeq = this.__statusSeqNumbers[oldStatus];
        let newStatus = newJP.status;
        let newStatusSeq = this.__statusSeqNumbers[newStatus];
        if (newStatusSeq < oldStatusSeq)    // going backward in status
            return oldJP;
        else if (newStatusSeq > oldStatusSeq) { // moving forward in status
            return newJP;
        } else {    // newStatusSeq == oldStatusSeq
            if (newStatus === 'STARTED') {  // newStatus === oldStatus === STARTED
                return (newJP.numTasksFinished > oldJP.numTasksFinished ? newJP : oldJP);
            } else
                return oldJP;
        }
    }
    // returns the job status has been changed
    private feedJobProgressImpl(jobProgress: IJobProgress) : boolean {
        let jobId = jobProgress.jobId;
        let trackItem = this.__trackItems[jobId];
        if (trackItem) {
            let oldJP = trackItem.jp;
            let newJP = this.jobTransition(oldJP, jobProgress);
            if (newJP != oldJP) {  // status changed
                trackItem.jp = newJP;
                if (newJP.status === 'FINISHED' || newJP.status === 'ABORTED') {
                    delete this.__trackItems[jobId];
                    this.__numJobs--;
                    this.emit('job_removed', jobId);
                }
                this.emit('job_status_changed', trackItem);
                return true;
            } else
                return false;
        } else
            return false;
    }

    feedJobProgress(jobProgress: IJobProgress) : void {
        if (this.feedJobProgressImpl(jobProgress))
            this.emit('change');
    }

    feedMultiJobsProgress(jobsProgress: IJobProgress[]) : void {
        if (jobsProgress && jobsProgress.length > 0) {
            let changed = false;
            for (let i in jobsProgress) {
                let statusChanged = this.feedJobProgressImpl(jobsProgress[i]);
                if (statusChanged && !changed)
                    changed = true;
            }
            if (changed)
                this.emit('change');
        }
    }

    get numJobs():number {return this.__numJobs;}

    toJSON(): IJobProgress[] {
        let ret: IJobProgress[] = [];
        for (let jobId in this.__trackItems)
            ret.push(this.__trackItems[jobId].jp);
        return ret;
    }
}

// will emit the followings events
// 1. changed
// 2. polling
// 3. error
// 4. jobs-status
class JobsStatusPolling extends events.EventEmitter {
    private __numJobs:number = 0;
    private __queues: {[jobId:string]:boolean} = {};
    private __timer: NodeJS.Timer = null;
    constructor(private __gridDB: IGridDB, private __pollingIntervalMS: number) {
        super();
    }
    addJob(jobId: string) : void {
        if (!this.__queues[jobId]) {
            this.__queues[jobId] = true;
            this.__numJobs++;
            this.emit('changed');
        }
    }
    private clearJobs() : void {
        this.__queues = {};
        this.__numJobs = 0;
        this.emit('changed');
    }
    start() : void {
        let timerProc = () : void => {
            let jobIds: string[] = [];
            for (let jobId in this.__queues)
                jobIds.push(jobId);
            if (jobIds.length > 0) {
                this.emit('polling', jobIds);
                this.__gridDB.getMultiJobsProgress(jobIds, (err:any, jobsProgress:IJobProgress[]) => {
                    if (err) {
                        this.emit('error', err);
                    } else {
                        this.emit('jobs-status', jobsProgress);
                        this.clearJobs();
                    }
                });
            }
            this.__timer = setTimeout(timerProc, this.__pollingIntervalMS);
        };
        if (!this.__timer) {
            this.__timer = setTimeout(timerProc, this.__pollingIntervalMS);
            this.emit('changed');
        }
    }
    stop(): void {
        if (this.__timer) {
            clearTimeout(this.__timer);
            this.__timer = null;
            this.emit('changed');
        }
    }
    get numJobs(): number {return this.__numJobs;}
    get started(): boolean {return (this.__timer != null);}
    toJSON(): IJobsStatusPollingJSON {
        let ret: IJobsStatusPollingJSON = {
            numJobs: this.numJobs
            ,started: this.started
        };
        return ret;
    }
}

// will emit the following events
// 1. changed
// 2. jobs_tracking_changed
// 3. job_status_changed
// 4. error
export class Dispatcher extends events.EventEmitter {
    private __queueClosed: boolean = false;
    private __dispatchEnabled: boolean = true;
    private __numOutstandingAcks: number = 0;
    private __nodes: Nodes = new Nodes();
    private __queue: Queue = new Queue();
    private __jobsTacker: JobsTracker = new JobsTracker();
    private __jobsPolling: JobsStatusPolling = null;
    constructor(private __nodeMessaging: INodeMessaging, private __gridDB: IGridDB) {
        super();

        this.__jobsPolling = new JobsStatusPolling(this.__gridDB, 500);
        this.__jobsPolling.on('changed', () => {
            this.emit('changed');
        }).on('error', (err:any) => {
            this.emit('error', err);
        }).on('jobs-status', (jobsProgress:IJobProgress[]) => {
            this.__jobsTacker.feedMultiJobsProgress(jobsProgress);
        });
        
        this.__queue.on('enqueued', () => {
            this.dispatchTasksIfNecessary();
        }).on('changed', () => {
            this.emit('changed');
        });

        this.__nodes.on('changed', () => {
            this.emit('changed');
        }).on('more_cpus_available', () => {
            this.dispatchTasksIfNecessary();
        });

        this.__jobsTacker.on('change', () => {
            this.emit('jobs_tracking_changed');
        }).on('job_status_changed', (jobTrackItem: IJobTrackItem) => {
            this.emit('job_status_changed', jobTrackItem);
        }).on('job_added', ()=> {
            this.emit('changed');
        }).on('job_removed', ()=> {
            this.emit('changed');
        });

        this.__jobsPolling.start(); // start the jobs polling
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
                        this.emit('error', err);
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
    submitJob(user: IGridUser, jobXML: string, done:(err:any, jobId: string) => void, notificationCookie:string = null): void {
        if (this.queueClosed) {
            done('queue is currently closed', null);
        } else {
            this.__gridDB.registerNewJob(user, jobXML, (err:any, jobProgress: IJobProgress) => {
                if (!err) {
                    this.__jobsTacker.addJob(jobProgress, notificationCookie);
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
    reSubmitJob(user: IGridUser, oldJobId: string, failedTasksOnly: boolean, done:(err:any, jobId: string) => void, notificationCookie:string = null) : void {
        if (this.queueClosed) {
            done('queue is currently closed', null);
        } else {
            this.__gridDB.reSubmitJob(user, oldJobId, failedTasksOnly, (err:any, jobProgress: IJobProgress) => {
                if (!err) {
                    this.__jobsTacker.addJob(jobProgress, notificationCookie);
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
        /*
        this.__gridDB.getJobProgress(jobId, (err:any, jobProgress: IJobProgress) => {
            if (err)
                this.emit('error', err);
            else
                this.__jobsTacker.feedJobProgress(jobProgress);
        });
        */
        this.__jobsPolling.addJob(jobId);
    }
    getJobProgress(jobId: string, done:(err:any, jobProgress: IJobProgress) => void): void {
        this.__gridDB.getJobProgress(jobId, done);
    }
    getJobInfo(jobId: string, done:(err:any, jobInfo: IJobInfo) => void): void {
        this.__gridDB.getJobInfo(jobId, done);
    }
    killJob(jobId: string, done: (err: any) => void): void {
        let getKillJobCall : IKillJobCallFactory = (jobId:string, markJobAborted: boolean, waitMS:number, maxTries:number, tryIndex: number, done: (err: any) => void) : IKillJobCall => {
            return () : void => {
                console.log('job ' + jobId.toString() + ' kill poll #' + (tryIndex+1).toString() + '...');
                this.__gridDB.killJob(jobId, markJobAborted, (err: any, runningProcess: IRunningProcessByNode, jobProgress: IJobProgress) => {
                    if (err)
                        done(err);
                    else {
                        this.__jobsTacker.feedJobProgress(jobProgress);
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
        // check the job status first
        this.getJobProgress(jobId, (err: any, jobProgress: IJobProgress) => {
            if (err)
                done(err);
            else {
                if (jobProgress.status === 'FINISHED' || jobProgress.status === 'ABORTED')
                    done('job already finished');
                else {
                    console.log('killing job ' + jobId.toString() + '...');
                    this.__queue.clearJobTasks(jobId);
                    getKillJobCall(jobId, true, 3000, 5, 0, (err: any) => {
                        console.log('job ' + jobId.toString() + ' kill process finished.' + (err ? ' error=' + JSON.stringify(err) : ' job was killed successfully :-)'));
                        done(err);
                    })();
                }
            }
        });
    }
    getNode(nodeId:string): INodeItem {return this.__nodes.getNode(nodeId);}
    setNodeEnabled(nodeId: string, enabled: boolean) : void {
        if (enabled)
            this.__nodes.enableNode(nodeId);
        else
            this.__nodes.disableNode(nodeId);
    }
    toJSON(): IDispatcherJSON {
        return {
            nodes: this.__nodes.toJSON()
            ,queueClosed: this.queueClosed
            ,queue: this.__queue.toJSON()
            ,dispatchEnabled: this.dispatchEnabled
            ,dispatching: this.dispatching
            ,numOutstandingAcks: this.__numOutstandingAcks
            ,numTrackingJobs: this.__jobsTacker.numJobs
            ,jobsPolling: this.__jobsPolling.toJSON()
        };
    }
    get trackingJobs(): IJobProgress[] {return this.__jobsTacker.toJSON();}
}