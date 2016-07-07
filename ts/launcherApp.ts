import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {GridMessage, INodeReady, ITask, ITaskExecParams, ITaskExecResult} from './messaging';
import {GridDB} from './gridDB';
import {TaskRunner} from './taskRunner';
let EventSource = require('eventsource');
let $ = require('jquery-no-dom');
import treeKill = require('tree-kill');

let configFile = (process.argv.length < 3 ? path.join(__dirname, '../launcher_testing_config.json') : process.argv[2]);
let config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

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

let dispatcherConfig = config["dispatcher"];
let url:string = dispatcherConfig["eventSourceUrl"];
let eventSourceInitDict = dispatcherConfig["eventSourceInitDict"];
let cpus = os.cpus();
let numCPUs:number = (config['numCPUs'] ? config['numCPUs'] : cpus.length - (config['reservedCPUs'] ? config['reservedCPUs'] : 2));
numCPUs = Math.max(numCPUs, 1);
let nodeName:string = (config["nodeName"] ? config["nodeName"] : getDefaultNodeName());
console.log('nodeName=' + nodeName + ', cpus=' + cpus.length + ', numCPUs=' + numCPUs);

let gridDB = new GridDB(config.sqlConfig);
gridDB.ssql.on('error', (err:any) => {
    console.error('!!! Database connection error: ' + JSON.stringify(err));
}).on('connected', () => {
    console.error('connected to the database :-)');

    let msgBorker = new MsgBroker(() => new MessageClient(EventSource, $, url, eventSourceInitDict) , 10000);

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
        msgBorker.send('/topic/dispatcher', {}, msg, done);
    }

    function sendDispatcherTaskComplete(task: ITask, done: (err: any) => void) {
        let msg: GridMessage = {
            type: 'task-complete'
            ,content: task
        };
        msgBorker.send('/topic/dispatcher', {}, msg, done);
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

    msgBorker.on('connect', (nodeId:string) : void => {
        console.log('connected: nodeId=' + nodeId);
        let sub_id = msgBorker.subscribe('/topic/node/' + nodeId
        ,(msg: IMessage): void => {
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

    msgBorker.on('error', (err: any) : void => {
        console.error('!!! Error:' + JSON.stringify(err));
    });

    msgBorker.connect();
});

gridDB.ssql.connect();