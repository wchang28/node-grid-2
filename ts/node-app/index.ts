import * as express from 'express';
import * as core from 'express-serve-static-core';
import {getRouter as getTopicRouter, ConnectedEventParams, ConnectionsManager, CommandEventParams} from 'sse-topic-router';
import {getConnectionFactory} from 'sse-topic-conn';
import {IGlobal} from '../global';
import {Dispatcher, INode, INodeReady, ITask} from '../dispatcher'; 

let router = express.Router();

let topicRouter = getTopicRouter('/event_stream', getConnectionFactory(5000));
let connectionsManager = topicRouter.connectionsManager;

router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

let getDispatcher = (req:any) : Dispatcher => {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

topicRouter.eventEmitter.on('client_connect', (params: ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress + ' connected to the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    let node:INode = {conn_id: params.conn_id, host: params.remoteAddress};
    dispatcher.addNewNode(node);
});

topicRouter.eventEmitter.on('client_disconnect', (params: ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    dispatcher.removeNode(params.conn_id);
});

topicRouter.eventEmitter.on('client_cmd', (params: CommandEventParams) => {
    let dispatcher = getDispatcher(params.req);
    let conn_id = params.conn_id;
    if (params.cmd === 'send') {
        let data = params.data;
        //console.log('data=' + JSON.stringify(data));
        if (data.destination === '/topic/dispatcher') {
            let msg = data.body;
            if (msg.type === 'node-ready') {
                let nodeReady: INodeReady = msg.content;
                dispatcher.markNodeReady(conn_id, nodeReady);
            } else if (msg.type === 'task-completed') {
                let task: ITask = msg.content;
                dispatcher.onNodeCompleteTask(conn_id, task);
            }
        }
    }
});

export {router as Router};
export {connectionsManager as ConnectionsManager};