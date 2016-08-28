import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as rcf from 'rcf';
import * as $node from 'rest-node';
import {GridMessage, INodeReady, ITask, ITaskExecParams, ITaskExecResult} from 'grid-client-core';
import {GridDB} from './gridDB';
import {TaskRunner} from './taskRunner';
import treeKill = require('tree-kill');
import {IGridDBConfiguration} from './gridDBConfig';

interface IConfiguration {
    numCPUs?: number;
    reservedCPUs?: number;
    nodeName?:string;
    dispatcherConfig: rcf.ApiInstanceConnectOptions;
    dbConfig: IGridDBConfiguration;
}

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../launcher_testing_config.json') : process.argv[2]);
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
console.log('nodeName=' + nodeName + ', cpus=' + cpus.length + ', numCPUs=' + numCPUs);

let gridDB = new GridDB(config.dbConfig.sqlConfig, config.dbConfig.dbOptions);
gridDB.on('error', (err:any) => {
    console.error('!!! Database connection error: ' + JSON.stringify(err));
}).on('connected', () => {
    console.error('connected to the database :-)');

    let client = api.$M(pathname, clientOptions);

    function sendDispatcherNodeReady(done: (err: any) => void) {
        console.log('sending a node-ready message...');
        let nodeReady: INodeReady = {
            numCPUs: numCPUs
            ,name: nodeName
        };
        let msg: GridMessage = {
            type: 'node-ready'
            ,content: nodeReady
        };
        client.send('/topic/dispatcher', {}, msg, done);
    }

    function sendDispatcherTaskComplete(task: ITask, done: (err: any) => void) {
        let msg: GridMessage = {
            type: 'task-complete'
            ,content: task
        };
        client.send('/topic/dispatcher', {}, msg, done);
    }

    function nodeRunTask(nodeId:string, task: ITask, done: (err: any) => void) {
        gridDB.getTaskExecParams(task, nodeId, nodeName, (err:any, taskExecParams: ITaskExecParams) => {
            if (err)
                done(err);
            else {
                let taskRunner = new TaskRunner(taskExecParams);
                taskRunner.on('started', (pid: number) => {
                    gridDB.markTaskStart(task, pid, (err: any) => {
                    });
                }).on('finished', (taskExecResult: ITaskExecResult) => {
                    gridDB.markTaskEnd(task, taskExecResult, done);
                });
                taskRunner.run();
            }
        });
    }

    function killProcessesTree(pids:number[]) {
        for (let i in pids) {
            let pid = pids[i];
            treeKill(pid, 'SIGKILL');
        }
    }

    client.on('connect', (nodeId:string) : void => {
        console.log('connected to the dispatcher: nodeId=' + nodeId);
        let sub_id = client.subscribe('/topic/node/' + nodeId
        ,(msg: rcf.IMessage): void => {
            console.log('msg-rcvd: ' + JSON.stringify(msg));
            let gMsg: GridMessage = msg.body;
            if (gMsg.type === 'launch-task') {
                let task: ITask = gMsg.content;
                nodeRunTask(nodeId, task, (err:any) => {
                    sendDispatcherTaskComplete(task, (err: any): void => {
                        if (err)
                            console.log('!!! Error sending task-complete message :-(');
                        else
                            console.log('task-complete message sent successfully :-)');
                    });
                });
            } else if (gMsg.type === 'kill-processes-tree') {
                let pids: number[] = gMsg.content;
                killProcessesTree(pids);
            }
        }
        ,{}
        ,(err: any): void => {
            if (err) {
                console.error('!!! Error: topic subscription failed');
            } else {
                console.log('topic subscribed sub_id=' + sub_id + " :-)");
                sendDispatcherNodeReady((err: any): void => {
                    if (err) {
                        console.error('!!! Error: message send failed');
                    } else {
                        console.log('message sent successfully :-)');
                    }
                });
            }
        });
    });

    client.on('error', (err: any) : void => {
        console.error('!!! Error:' + JSON.stringify(err));
    });
});

gridDB.connect();  // connect to the grid database