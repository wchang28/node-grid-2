import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as rcf from 'rcf';
import * as $node from 'rest-node';
import {GridMessage, INodeReady, ITask, ITaskExecParams, ITaskExecResult, NodeQueryStatusRequest, NodeQueryStatusResponse, ITaskRunningStatus} from 'grid-client-core';
import {getTaskLauncherGridDB, ITaskLauncherGridDB} from './gridDB';
import {runner} from './taskRunner';
import treeKill = require('tree-kill');
import {IGridDBConfiguration} from './gridDBConfig';
import * as events from 'events';
import * as shortid from "shortid";

interface IConfiguration {
    numCPUs?: number;
    reservedCPUs?: number;
    nodeName?:string;
    dispatcherConfig: rcf.ApiInstanceConnectOptions;
    dbConfig: IGridDBConfiguration;
}

export interface ITaskLauncherGridDBImpl {
    getTaskExecParams(task:ITask, nodeId: string, nodeName: string) : Promise<ITaskExecParams>;
    markTaskStart(task:ITask, pid:number) : Promise<void>;
    markTaskEnd(task:ITask, result: ITaskExecResult) : Promise<void>;
}

class TasksTracker {
    private _map: {[TrackingId: string]: ITaskRunningStatus};
    constructor() {
        this._map = {};
    }
    beginTracking(task: ITask): string {
        let TrackingId = shortid.generate();
        this._map[TrackingId] = {
            j: task.j
            ,t: task.t
        };
        return TrackingId;
    }
    updateTracking(TrackingId: string, info: any) {
        if (this._map[TrackingId]) {
            if (info.cmd) this._map[TrackingId].cmd = info.cmd;
            if (info.pid) this._map[TrackingId].pid = info.pid;
        }
    }
    endTracking(TrackingId: string) {
        if (this._map[TrackingId])
            delete this._map[TrackingId];
    }
    toJSON() : ITaskRunningStatus[] {
        let ret: ITaskRunningStatus[] = [];
        for (let TrackingId in this._map)
            ret.push(this._map[TrackingId]);
        return ret;
    }
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../config/launcher_testing_config.json') : process.argv[2]);
let config: IConfiguration = JSON.parse(fs.readFileSync(configFile, 'utf8'));

function getDefaultNodeName() : string {
    let interfaces = os.networkInterfaces();
    let ipv4Addresses:string[] = [];
    for (let k in interfaces) {
        for (let k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                ipv4Addresses.push(address.address);
            }
        }
    }
    if (ipv4Addresses.length > 0) {
        return ipv4Addresses[0];
    } else {	// no IPv4 address
        return '{?}';
    }
}

let dispatcherConfig = config.dispatcherConfig;

let pathname = '/node-app/events/event_stream';
let api = new rcf.AuthorizedRestApi($node.get(), rcf.AuthorizedRestApi.connectOptionsToAccess(dispatcherConfig));
let clientOptions: rcf.IMessageClientOptions = {reconnetIntervalMS: 10000};

let cpus = os.cpus();
let numCPUs:number = (config.numCPUs ? config.numCPUs : cpus.length - (config.reservedCPUs ? config.reservedCPUs : 2));
numCPUs = Math.max(numCPUs, 1);
let nodeName:string = (config.nodeName ? config.nodeName : getDefaultNodeName());
console.log(new Date().toISOString() + ': nodeName=' + nodeName + ', cpus=' + cpus.length + ', numCPUs=' + numCPUs);

let tasksTracker = new TasksTracker();

interface ITaskExec {
    run(task: ITask) : Promise<void>;
    on(event: "error", listener: (err: any) => void) : this;
    on(event: "exec-params", listener: (taskExecParams: ITaskExecParams) => void) : this;
    on(event: "started", listener: (pid: number) => void) : this;
    on(event: "finished", listener: (retCode: number) => void) : this;
}
class TaskExec extends events.EventEmitter implements ITaskExec {
    constructor(private nodeId: string, private db: ITaskLauncherGridDBImpl) {
        super();
    }
    run(task: ITask) : Promise<void> {
        return new Promise<void>((resolve: () => void) => {
            this.db.getTaskExecParams(task, this.nodeId, nodeName)
            .then((taskExecParams: ITaskExecParams) => {
                this.emit("exec-params", taskExecParams);
                let taskRunner = runner(taskExecParams);
                taskRunner.on('started', (pid: number) => {
                    this.emit("started", pid);
                    this.db.markTaskStart(task, pid)
                    .then(() => {
                    }).catch((err: any) => {
                        this.emit("error", "error marking task <START> in DB. err=" + JSON.stringify(err));
                    });
                }).on('finished', (taskExecResult: ITaskExecResult) => {
                    this.emit("finished", taskExecResult.retCode);
                    this.db.markTaskEnd(task, taskExecResult)
                    .then(() => {
                        resolve();
                    }).catch((err: any) => {
                        this.emit("error", "error marking task <END> in DB. err=" + JSON.stringify(err));
                        resolve();
                    });
                }).run();
            }).catch((err: any) => {
                this.emit("error", "error retrieving task execution params from DB. err=" + JSON.stringify(err));
                resolve();
            });
        });
    }
}

function getTaskExec(nodeId: string, db: ITaskLauncherGridDBImpl) : ITaskExec { return new TaskExec(nodeId, db);}

let gridDB = getTaskLauncherGridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
gridDB.on('error', (err:any) => {
    console.error(new Date().toISOString() + ': !!! Database connection error: ' + JSON.stringify(err));
}).on('connect', () => {
    console.error(new Date().toISOString() + ': connected to the database :-)');

    let client = api.$M(pathname, clientOptions);

    function sendDispatcherNodeReady() : Promise<rcf.RESTReturn> {
        console.log(new Date().toISOString() + ': sending a node-ready message...');
        let nodeReady: INodeReady = {
            numCPUs: numCPUs
            ,name: nodeName
        };
        let msg: GridMessage = {
            type: 'node-ready'
            ,content: nodeReady
        };
        return client.send('/topic/dispatcher', {type: 'node-ready'}, msg);
    }

    function notifyDispatcherTaskComplete(task: ITask) : Promise<rcf.RESTReturn> {
        let msg: GridMessage = {
            type: 'task-complete'
            ,content: task
        };
        return client.send('/topic/dispatcher', {type: 'task-complete'}, msg);
    }

    function killProcessesTree(pids:number[]) {
        for (let i in pids) {
            let pid = pids[i];
            treeKill(pid, 'SIGKILL');
        }
    }

    function sendNodeQueryStatusResponse(response: NodeQueryStatusResponse) : Promise<rcf.RESTReturn> {
        let msg: GridMessage = {
            type: 'node-query-status'
            ,content: response
        };
        return client.send('/topic/dispatcher', {type: 'node-query-status'}, msg);        
    }

    client.on('connect', (nodeId:string) : void => {
        console.log(new Date().toISOString() + ': connected to the dispatcher: nodeId=' + nodeId);
        client.subscribe('/topic/node/' + nodeId
        ,(msg: rcf.IMessage): void => {
            console.log(new Date().toISOString() + ': msg-rcvd: ' + JSON.stringify(msg));
            let gMsg: GridMessage = msg.body;
            if (gMsg.type === 'launch-task') {
                let task: ITask = gMsg.content;
                let TrackingId = tasksTracker.beginTracking(task);
                let taskExec = getTaskExec(nodeId, gridDB);
                taskExec.on("error", (err: any) => {
                    console.error(new Date().toISOString() + ": !!! Error running task " + JSON.stringify(task) + ": " + JSON.stringify(err) + " :-(");
                    // TODO: sent error message to the server
                }).on("exec-params", (taskExecParams: ITaskExecParams) => {
                    tasksTracker.updateTracking(TrackingId, {cmd: taskExecParams.cmd});
                    console.log(new Date().toISOString() + ": running task " + JSON.stringify(task) + " with exec-params=\n" + JSON.stringify(taskExecParams, null, 2));
                }).on("started", (pid: number) => {
                    tasksTracker.updateTracking(TrackingId, {pid});
                    console.log(new Date().toISOString() + ": task " + JSON.stringify(task) + " started with pid=" + pid);
                }).on("finished", (retCode: number) => {
                    console.log(new Date().toISOString() + ": task " + JSON.stringify(task) + " finished with retCode=" + retCode);
                }).run(task)
                .then(() => {
                    tasksTracker.endTracking(TrackingId);
                    notifyDispatcherTaskComplete(task)
                    .then(() => {
                        console.log(new Date().toISOString() + ': <task-complete> notification for task ' + JSON.stringify(task) + ' successfully sent to the dispatcher :-)');
                    }).catch((err: any) => {
                        console.error(new Date().toISOString() + ': !!! Error sending <task-complete> notification for task '+ JSON.stringify(task) + ' to the dispatcher :-(');
                    });
                });
            } else if (gMsg.type === 'kill-processes-tree') {
                let pids: number[] = gMsg.content;
                killProcessesTree(pids);
            } else if (gMsg.type === 'node-query-status') {
                let request: NodeQueryStatusRequest = gMsg.content;
                let response: NodeQueryStatusResponse = {
                    QueryId: request.QueryId
                    ,Status: {
                        FreeMem: os.freemem()
                        ,TotalMem: os.totalmem()
                        ,UptimeSec: os.uptime()
                        ,RunningTasks: tasksTracker.toJSON()                     
                    }
                };
                sendNodeQueryStatusResponse(response)
                .then(() => {
                }).catch((err: any) => {
                    console.error(new Date().toISOString() + ': !!! Error sending back <node-query-status> message: ' + JSON.stringify(err));
                });
            }
        },{})
        .then((sub_id: string) => {
            console.log(new Date().toISOString() + ': topic subscribed sub_id=' + sub_id + " :-)");
            sendDispatcherNodeReady()
            .then(() => {
                console.log(new Date().toISOString() + ': message sent successfully :-)');
            }).catch((err: any) => {
                console.error(new Date().toISOString() + ': !!! Error: message send failed');
            });
        }).catch((err: any) => {
            console.error(new Date().toISOString() + ': !!! Error: topic subscription failed');
        });
    });

    client.on('error', (err: any) : void => {
        console.error(new Date().toISOString() + ': !!! Msg client error:' + JSON.stringify(err));
    });
});

gridDB.connect();  // connect to the grid database