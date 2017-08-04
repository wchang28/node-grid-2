
import * as events from 'events';
import * as _ from 'lodash';
import {Utils, INode, INodeReady, ITask, IGridUser, IJobProgress, IJobInfo, IJobResult, IRunningProcessByNode, IGridJobSubmit, INodeItem, IQueueJSON, IDispControl, IJobsStatusPollingJSON, IDispStates, IDispatcherJSON, ITaskResult} from 'grid-client-core';
import {IAutoScalableState, IWorker, IWorkerState, IAutoScalableGrid} from 'autoscalable-grid';

interface ITaskItem extends ITask {
    r?: number; // number of retries
}

interface ICPUItem {
    nodeId: string;
}

interface ITaskItemDispatch extends ITaskItem {
    priority: number;  // priority
}

export interface INodeMessenger {
    dispatchTaskToNode(nodeId: string, task: ITask) : void;
    killProcessesTree(nodeId: string, pids:number[]) : void;
}

export interface JobKillStatus {
    runningProcess: IRunningProcessByNode;
    jobProgress: IJobProgress
}

export interface IServerGridDB {
    registerNewJob(user: IGridUser, jobSubmit: IGridJobSubmit) : Promise<IJobProgress>;
    reSubmitJob(user: IGridUser, oldJobId: string, failedTasksOnly: boolean) : Promise<IJobProgress>;
    getJobProgress(jobId: string) : Promise<IJobProgress>;
    getMultiJobsProgress(jobIds:string[]) : Promise<IJobProgress[]>;
    getJobInfo(jobId: string) : Promise<IJobInfo>;
    getJobResult(jobId:string) : Promise<IJobResult>;
    killJob(jobId:string, markJobAborted: boolean) : Promise<JobKillStatus>;
    getMostRecentJobs() : Promise<IJobInfo[]>;
    getTaskResult(task: ITask) : Promise<ITaskResult>;
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

export interface IDispatcherConfig {
    tasksDispatchFailureMaxRertries?: number;
    jobsPollingIntervalMS?: number;
    jobsKillPollingIntervalMS?: number;
    jobsKillMaxRetries?: number;
}

// will emit the following events
// 1. usage-changed ()
// 2. more-cpus-available ()
// 3. node-added (id: string)
// 4. node-ready (id: string)
// 5. node-removed (id: string)
// 6. node-enabled (id: string)
// 7. nodes-disabled (ids: string[])
// 8. nodes-terminating (ids: string[])
class Nodes extends events.EventEmitter {
    private __nodes: {[id:string]: INodeItem} = {};
    constructor() {
        super();
    }
    // returen true if node is available for task dispatching
    private nodeActive(node: INodeItem): boolean {
        return (node.enabled && typeof node.numCPUs === 'number' && node.numCPUs > 0 && !node.terminating);
    }
    incrementCPUUsageCount(id: string) {
        let node = this.__nodes[id];
        if (node) {
            node.cpusUsed++;
            node.lastIdleTime = null;
            this.emit('usage-changed');
        }
    }
    decrementCPUUsageCount(id: string) {
        let node = this.__nodes[id];
        if (node && node.cpusUsed > 0) {
            node.cpusUsed--;
            if (node.cpusUsed === 0) node.lastIdleTime = new Date().getTime();
            this.emit('usage-changed');
            if (this.nodeActive(node))
                this.emit('more-cpus-available');
        }
    }
    enableNode(id: string) : void {
        let node = this.__nodes[id];
        if (node) {
            if (!node.terminating && !node.enabled) {
                node.enabled = true;
                this.emit('node-enabled', id);
                if (this.nodeActive(node)) {
                    this.emit('more-cpus-available');
                }
            }
        }
    }
    disableNodes(ids: string[]) : void {
        if (ids && ids.length > 0) {
            let nodeIds: string[] = [];
            for (let i in ids) {
                let id = ids[i];
                let node = this.__nodes[id];
                if (node && node.enabled) {
                    node.enabled = false;
                    nodeIds.push(id);
                }
            }
            if (nodeIds.length > 0) this.emit('nodes-disabled', nodeIds);
        }
    }
    disableNode(id: string) : void { this.disableNodes([id]);}

    requestToTerminateNodes(ids: string[]) : string[] {
        if (ids && ids.length > 0) {
            let ret: string[] = []
            let disabledNodeIds: string[] = [];
            for (let i in ids) {
                let id = ids[i];
                let node = this.__nodes[id];
                if (node && !node.terminating && node.cpusUsed === 0) {
                    ret.push(id);
                    if (node.enabled) {
                        node.enabled = false;
                        disabledNodeIds.push(id);
                    }
                }
            }
            if (disabledNodeIds.length > 0) this.emit('nodes-disabled', disabledNodeIds);
            return (ret.length > 0 ? ret : null);
        } else
            return null;
    }

    setNodesTerminating(ids: string[]) : void {
        if (ids && ids.length > 0) {
            let disabledNodeIds: string[] = [];
            let terminatingNodeIds: string[] = [];
            for (let i in ids) {
                let id = ids[i];
                let node = this.__nodes[id];
                if (node) {
                    if (node.enabled) {
                        node.enabled = false;
                        disabledNodeIds.push(id);
                    }
                    if (!node.terminating) {
                        node.terminating = true;
                        terminatingNodeIds.push(id);
                    }
                }
            }
            if (disabledNodeIds.length > 0) this.emit('nodes-disabled', disabledNodeIds);
            if (terminatingNodeIds.length > 0) this.emit('nodes-terminating', terminatingNodeIds);
        }
    }

    setNodeTerminating(id: string) : void { this.setNodesTerminating([id]); }

    addNewNode(newNode: INode) : void {
        if (!this.__nodes[newNode.id]) {
            let node: INodeItem = {
                name: newNode.name
                ,id: newNode.id
                ,remoteAddress: newNode.remoteAddress
                ,remotePort: newNode.remotePort
                ,numCPUs: null
                ,enabled: true
                ,terminating: false
                ,cpusUsed: 0
                ,lastIdleTime: new Date().getTime()
            }
            this.__nodes[newNode.id] = node;
            this.emit('node-added', newNode.id);
        }
    }
    markNodeReady(id: string, nodeReady: INodeReady) : void {
        let node = this.__nodes[id];
        if (node) {
            node.numCPUs = nodeReady.numCPUs;
            if (nodeReady.name) node.name = nodeReady.name;
            node.lastIdleTime = new Date().getTime();
            this.emit('node-ready', id);
            if (this.nodeActive(node)) {
                this.emit('more-cpus-available');
            }
        }
    }
    // remove the node
    removeNode(id: string) : void {
        let node = this.__nodes[id];
        if (node) {
            delete this.__nodes[id];
            this.emit('node-removed', id);
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
    // returns the number of idle cpus
    get numIdleCPUs(): number {
        let count = 0;
        for (let conn_id in this.__nodes) {    // for each node/host
            let node = this.__nodes[conn_id];
            if (typeof node.numCPUs === 'number' && node.numCPUs > 0)
                count += (node.numCPUs - node.cpusUsed);
        }
        return count;
    }
    toJSON(): INodeItem[] {
        let ret: INodeItem[] = [];
        for (let conn_id in this.__nodes)
            ret.push(this.__nodes[conn_id]);
        return ret;
    }
    // AutoScalableGrid support
    /////////////////////////////////////////////////////////////////////////
    getWorkers(nodeIds: string[]) : Promise<IWorker[]> {
        let workers: IWorker[] = [];
        if (nodeIds && nodeIds.length > 0) {
            for (let i in nodeIds) {
                let nodeId = nodeIds[i];
                let node = this.__nodes[nodeId];
                if (node) {
                    let worker: IWorker = {
                        Id: node.id
                        ,Name: node.name
                        ,RemoteAddress: node.remoteAddress
                        ,RemotePort: node.remotePort   
                    }
                    workers.push(worker);
                } else
                    return Promise.reject({error: 'bad_node', error_description: 'worker_not_found'});
            }
        }
        return Promise.resolve<IWorker[]>(workers);
    }
    get WorkerStates() : IWorkerState[] {
        let ret: IWorkerState[] = [];
        for (let conn_id in this.__nodes) {   // for each node/host
            let node = this.__nodes[conn_id];
            let ws: IWorkerState = {
                Id: node.id
                ,Name: node.name
                ,RemoteAddress: node.remoteAddress
                ,RemotePort: node.remotePort    
                ,Busy: node.cpusUsed > 0
                ,Enabled: node.enabled
                ,Terminating: node.terminating
                ,LastIdleTime: node.lastIdleTime              
            }
            ret.push(ws);
        }
        return ret;
    }
    /////////////////////////////////////////////////////////////////////////
}

// will emit the following events
// 1. changed ()
// 2. enqueued ()
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
    get empty() : boolean {return (this.__numtasks === 0);}
    get numTasks() : number {return this.__numtasks;}
    get numJobs() : number {return this.__numJobs;}
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
// 1. changed ()
// 2. job-added (jobId: string)
// 3. job-removed (jobId: string)
// 4. job-status-changed (jobProgress: IJobProgress)
class JobsTracker extends events.EventEmitter {
    private __trackItems: {[jobId: string]: IJobProgress} = {};
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
    addJob(jobProgress: IJobProgress) : void {
        if (!this.__trackItems[jobProgress.jobId]) {
            this.__trackItems[jobProgress.jobId] = jobProgress;
            this.__numJobs++;
            this.emit('job-added', jobProgress.jobId);
            this.emit('changed');
            this.emit('job-status-changed', jobProgress);
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
        let oldJP = this.__trackItems[jobId];
        if (oldJP) {
            let newJP = this.jobTransition(oldJP, jobProgress);
            if (newJP != oldJP) {  // status changed
                this.__trackItems[jobId] = newJP;
                if (Utils.jobDone(newJP)) {
                    delete this.__trackItems[jobId];
                    this.__numJobs--;
                    this.emit('job-removed', jobId);
                }
                this.emit('job-status-changed', newJP);
                return true;
            } else
                return false;
        } else
            return false;
    }

    feedJobProgress(jobProgress: IJobProgress) : void {
        if (this.feedJobProgressImpl(jobProgress))
            this.emit('changed');
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
                this.emit('changed');
        }
    }

    get numJobs():number {return this.__numJobs;}

    get JobIds(): string[] {
        let ret: string[] = [];
        for (let jobId in this.__trackItems)
            ret.push(jobId);
        return ret;
    }

    toJSON(): IJobProgress[] {
        let ret: IJobProgress[] = [];
        for (let jobId in this.__trackItems)
            ret.push(this.__trackItems[jobId]);
        return ret;
    }
}

// will emit the followings events
// 1. changed ()
// 2. polling (jobIds: string[])
// 3. error (err: any)
// 4. jobs-status (jobsProgress:IJobProgress[])
class JobsStatusPolling extends events.EventEmitter {
    private __timer: NodeJS.Timer = null;
    constructor(private __gridDB: IServerGridDB, private __pollingIntervalMS: number, private __jobsSrc: () => string[]) {
        super();
    }
    start() : void {
        let timerProc = () : void => {
            let jobIds = this.__jobsSrc();
            if (jobIds && jobIds.length > 0) {
                this.emit('polling', jobIds);
                this.__gridDB.getMultiJobsProgress(jobIds)
                .then((jobsProgress:IJobProgress[]) => {
                    this.emit('jobs-status', jobsProgress);
                    this.__timer = setTimeout(timerProc, this.__pollingIntervalMS);
                }).catch((err: any) => {
                    this.emit('error', err);
                    this.__timer = setTimeout(timerProc, this.__pollingIntervalMS);
                });
            } else
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
    get started(): boolean {return (this.__timer != null);}
    toJSON(): IJobsStatusPollingJSON {return {started: this.started};}
}

// will emit the following events
// 1. queue-changed ()
// 2. nodes-usage-changed ()
// 3. node-added (id: string)
// 4. node-ready (id: string)
// 5. node-removed (id: string)
// 6. node-enabled (id: string)
// 7. nodes-disabled (nodeIds: string[])
// 8. nodes-terminating (nodeIds: string[])
// 9. states-changed ()
// 10. ctrl-changed ()
// 11. jobs-tracking-changed ()
// 12. job-status-changed (jobProgress: IJobProgress)
// 13. polling-changed ()
// 14. error (err: any)
// 15. kill-job-begin (jobId: string)
// 16. kill-job-end (jobId: string, err: any)
// 17. kill-job-poll (jobId: string, tries: number)
// 18. jobs-polling (jobIds: string[])
// 19. job-submitted (jobId: string)
// 20. job-finished (jobId: string)
// 21. task-complete (task: ITask)
export class Dispatcher extends events.EventEmitter {
    private __queueClosed: boolean = false;
    private __dispatchEnabled: boolean = true;
    private __numOutstandingAcks: number = 0;
    private __nodes: Nodes = new Nodes();
    private __queue: Queue = new Queue();
    private __jobsTacker: JobsTracker = new JobsTracker();
    private __jobsPolling: JobsStatusPolling = null;
    private static defaultConfig:IDispatcherConfig = {
        tasksDispatchFailureMaxRertries: 3
        ,jobsPollingIntervalMS: 500
        ,jobsKillPollingIntervalMS: 3000
        ,jobsKillMaxRetries: 5
    };
    private __config: IDispatcherConfig = null;
    private initConfig(config: IDispatcherConfig = null) : void {
        config = (config || Dispatcher.defaultConfig);
        this.__config = _.assignIn({}, Dispatcher.defaultConfig, config);
        this.__config.tasksDispatchFailureMaxRertries = Math.max(1, this.__config.tasksDispatchFailureMaxRertries);
        this.__config.jobsPollingIntervalMS = Math.max(200, this.__config.jobsPollingIntervalMS);
        this.__config.jobsKillPollingIntervalMS = Math.max(1000, this.__config.jobsKillPollingIntervalMS);
        this.__config.jobsKillMaxRetries = Math.max(2, this.__config.jobsKillMaxRetries);
    }
    constructor(private __nodeMessaging: INodeMessenger, private __gridDB: IServerGridDB, config: IDispatcherConfig = null) {
        super();

        this.initConfig(config);
        
        this.__jobsPolling = new JobsStatusPolling(this.__gridDB, this.__config.jobsPollingIntervalMS, () => this.__jobsTacker.JobIds);
        this.__jobsPolling.on('changed', () => {
            this.emit('polling-changed');
        }).on('error', (err:any) => {
            this.emit('error', err);
        }).on('jobs-status', (jobsProgress:IJobProgress[]) => {
            this.__jobsTacker.feedMultiJobsProgress(jobsProgress);
        }).on('polling', (jobIds: string[]) => {
            this.emit('jobs-polling', jobIds);
        });
        
        this.__queue.on('enqueued', () => {
            this.dispatchTasksIfNecessary();
        }).on('changed', () => {
            this.emit('queue-changed');
        });

        this.__nodes.on('usage-changed', () => {
            this.emit('nodes-usage-changed');
        }).on('more-cpus-available', () => {
            this.dispatchTasksIfNecessary();
        }).on('node-added', (nodeId: string) => {
            this.emit('node-added', nodeId);
        }).on('node-ready', (nodeId: string) => {
            this.emit('node-ready', nodeId);
        }).on('node-removed', (nodeId: string) => {
            this.emit('node-removed', nodeId);
        }).on('node-enabled', (nodeId: string) => {
            this.emit('node-enabled', nodeId);
        }).on('nodes-disabled', (nodeIds: string[]) => {
            this.emit('nodes-disabled', nodeIds);
        }).on('nodes-terminating', (nodeIds: string[]) => {
            this.emit('nodes-terminating', nodeIds);
        });

        this.__jobsTacker.on('changed', () => {
            this.emit('jobs-tracking-changed');
        }).on('job-status-changed', (jobProgress: IJobProgress) => {
            this.emit('job-status-changed', jobProgress);
        }).on('job-added', (jobId: string) => {
            this.emit('job-submitted', jobId);
        }).on('job-removed', (jobId: string) => {
            this.emit('job-finished', jobId);
        });

        this.__jobsPolling.start(); // start the jobs polling
    }

    get queueClosed() : boolean {return this.__queueClosed;}
    set queueClosed(value: boolean) {
        if (this.__queueClosed != value) {
            this.__queueClosed = value;
            this.emit('ctrl-changed');
        }
    }

    get dispatchEnabled() : boolean {return this.__dispatchEnabled;}
    set dispatchEnabled(value: boolean) {
        if (this.__dispatchEnabled != value) {
            this.__dispatchEnabled = value;
            this.emit('ctrl-changed');
            if (this.__dispatchEnabled)
                this.dispatchTasksIfNecessary();
        }
    }

    get dispatching(): boolean {return this.__numOutstandingAcks > 0;}

    private setOutstandingAcks(value: number) : void {
        if (this.__numOutstandingAcks !== value) {
            this.__numOutstandingAcks = value;
            this.emit('states-changed');
        }
    }
    private decrementOutstandingAcks() : void {
        if (this.__numOutstandingAcks > 0) {
            this.__numOutstandingAcks--;
            this.emit('states-changed');
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
    private dispatchTasksIfNecessary() : void {
        let availableCPUs: ICPUItem[] = null;
        let tasks: ITaskItemDispatch[] = null;
        if (this.dispatchEnabled && !this.dispatching && (availableCPUs = this.__nodes.getAvailableCPUs()) && (tasks = this.__queue.dequeue(availableCPUs.length))) {
            //assert(availableCPUs.length>0 && tasks.length > 0 && availableCPUs.length >= tasks.length);
            this.setOutstandingAcks(tasks.length);
            let cpusSelected = this.randomlySelectCPUs(availableCPUs, tasks.length);            //assert(cpusSelected.length == tasks.length);
            //console.log('availableCPUs.length=' + availableCPUs.length + ', tasks.length=' +  tasks.length + ', cpusSelected.length=' + cpusSelected.length);
            for (let i in tasks) {  // for each task
                let task = tasks[i];
                let cpu = cpusSelected[i];
                if (!task.r)
                    task.r = 1;
                else
                    task.r++;
                this.__nodeMessaging.dispatchTaskToNode(cpu.nodeId, task);
                this.__nodes.incrementCPUUsageCount(cpu.nodeId);
                this.decrementOutstandingAcks();
            }
        }
    }

    private enqueueJobImpl(priority: number, jobProgress: IJobProgress) : IJobProgress {
        this.__jobsTacker.addJob(jobProgress);
        let tasks: ITaskItem[] = [];
        for (let i:number = 0; i < jobProgress.numTasks; i++)
            tasks.push({j: jobProgress.jobId, t: i});
        this.__queue.enqueue(priority, tasks);
        return jobProgress;
    }

    submitJob(user: IGridUser, jobSubmit: IGridJobSubmit) : Promise<IJobProgress> {
        if (this.queueClosed)
            return Promise.reject({error: "forbidden", error_description: 'queue is currently closed'});
        else
            return this.__gridDB.registerNewJob(user, jobSubmit).then((jobProgress: IJobProgress) => this.enqueueJobImpl(user.profile.priority, jobProgress));
    }
    reSubmitJob(user: IGridUser, oldJobId: string, failedTasksOnly: boolean) : Promise<IJobProgress> {
        if (this.queueClosed)
            return Promise.reject({error: "forbidden", error_description: 'queue is currently closed'});
        else
            return this.__gridDB.reSubmitJob(user, oldJobId, failedTasksOnly).then((jobProgress: IJobProgress) => this.enqueueJobImpl(user.profile.priority, jobProgress));
    }
    addNewNode(newNode: INode) : void {this.__nodes.addNewNode(newNode);}
    removeNode(nodeId: string) : void {this.__nodes.removeNode(nodeId);}
    markNodeReady(nodeId: string, nodeReady: INodeReady) : void {this.__nodes.markNodeReady(nodeId, nodeReady);}
    onNodeCompleteTask(nodeId: string, task: ITask): void {
        this.__nodes.decrementCPUUsageCount(nodeId);
        let tk:ITask = {j:task.j, t: task.t};
        this.emit('task-complete', tk);
    }
    getJobProgress(jobId: string) : Promise<IJobProgress> {return this.__gridDB.getJobProgress(jobId);}
    getJobInfo(jobId: string): Promise<IJobInfo> {return this.__gridDB.getJobInfo(jobId);}
    getJobResult(jobId: string) : Promise<IJobResult> {return this.__gridDB.getJobResult(jobId);}
    getTaskResult(task: ITask) : Promise<ITaskResult> {return this.__gridDB.getTaskResult(task);}
    killJob(jobId: string): Promise<void> {
        let getKillJobCall : IKillJobCallFactory = (jobId:string, markJobAborted: boolean, waitMS:number, maxTries:number, tryIndex: number, done: (err: any) => void) : IKillJobCall => {
            return () : void => {
                this.emit('kill-job-poll', jobId, tryIndex+1);
                this.__gridDB.killJob(jobId, markJobAborted)
                .then((killStatus: JobKillStatus)=> {
                    let runningProcess = killStatus.runningProcess;
                    let jobProgress = killStatus.jobProgress;
                    this.__jobsTacker.feedJobProgress(jobProgress);
                    if (JSON.stringify(runningProcess) === '{}')    // no more process running
                        done(null);
                    else {  // there are tasks still running
                        for (let nodeId in runningProcess) {    // for each node
                            let pids = runningProcess[nodeId];
                            this.__nodeMessaging.killProcessesTree(nodeId, pids);
                        }
                        if (tryIndex < maxTries-1)
                            setTimeout(getKillJobCall(jobId, false, waitMS, maxTries, tryIndex+1, done), waitMS);
                        else
                            done({error: "request-timeout", error_description: "kill poll max-out"});
                    }
                }).catch(done);
            };
        }
        // check the job status first
        return this.getJobProgress(jobId)
        .then((jobProgress: IJobProgress) => {
            if (jobProgress.status === 'FINISHED' || jobProgress.status === 'ABORTED')
                return Promise.reject({error: "not-found", error_description: 'job already finished'});
            else {
                this.emit('kill-job-begin', jobId);
                this.__queue.clearJobTasks(jobId);
                return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
                    let killJob = getKillJobCall(jobId, true, this.__config.jobsKillPollingIntervalMS, this.__config.jobsKillMaxRetries, 0, (err: any) => {
                        this.emit('kill-job-end', jobId, err);
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                    killJob();
                });
            }
        });
    }
    getMostRecentJobs() : Promise<IJobInfo[]> {return this.__gridDB.getMostRecentJobs();}
    getNode(nodeId:string): INodeItem {return this.__nodes.getNode(nodeId);}
    setNodeEnabled(nodeId: string, enabled: boolean) : void {
        if (enabled)
            this.__nodes.enableNode(nodeId);
        else
            this.__nodes.disableNode(nodeId);
    }

    requestToTerminateNodes(nodeIds: string[]) : string[] {
        if (this.dispatching)
            return null;
        else
            return this.__nodes.requestToTerminateNodes(nodeIds);
    }
    setNodesTerminating(nodeIds: string[]) : void {this.__nodes.setNodesTerminating(nodeIds);}

    get dispControl(): IDispControl {
        return {
            queueClosed: this.queueClosed
            ,dispatchEnabled: this.dispatchEnabled
        };
    }
    get states(): IDispStates {
        return {
            dispatching: this.dispatching
            ,numOutstandingAcks: this.__numOutstandingAcks
        };
    }
    get nodes() : INodeItem[] {return this.__nodes.toJSON();}
    get queue() : IQueueJSON {return this.__queue.toJSON();}
    get trackingJobs(): IJobProgress[] {return this.__jobsTacker.toJSON();}
    get jobsPolling() : IJobsStatusPollingJSON {return this.__jobsPolling.toJSON();}
    toJSON(): IDispatcherJSON {
        return {
            nodes: this.nodes
            ,queue: this.queue
            ,dispControl: this.dispControl
            ,states: this.states
            ,jobsPolling: this.jobsPolling
        };
    }

    // AutoScalableGrid support
    ///////////////////////////////////////////////////////////////////////////
    getWorkers(nodeIds: string[]) : Promise<IWorker[]> {return this.__nodes.getWorkers(nodeIds);}
    get AutoScalableState() : IAutoScalableState {
        let state: IAutoScalableState = {
            CurrentTime: new Date().getTime()
            ,QueueEmpty: this.__queue.empty
            ,CPUDebt: this.__queue.numTasks - this.__nodes.numIdleCPUs
            ,WorkerStates: this.__nodes.WorkerStates
        };
        return state;
    }
    ///////////////////////////////////////////////////////////////////////////
}