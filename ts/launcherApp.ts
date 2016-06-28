import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {GridMessage, INodeReady, ITask} from './messaging';
let EventSource = require('eventsource');
let $ = require('jquery-no-dom');

let url:string = 'http://127.0.0.1:26354/node-app/events/event_stream';
let eventSourceInitDict = null;
let numCPUs:number = 5;
let nodeName:string = 'Wen Chang';

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
    console.log('sending a task-complete message...');
    let msg: GridMessage = {
        type: 'task-complete'
        ,content: task
    };
    msgBorker.send('/topic/dispatcher', {}, msg, done);
}

function runTask(task: ITask, done: (err: any) => void) {
    done(null); // TODO:
}

function killProcessesTree(pids:number[]) {
    for (let i in pids) {
        let pid = pids[i];
        // TODO:
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
             runTask(task, (err:any) => {
                 sendDispatcherTaskComplete(task, (err: any): void => {

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
