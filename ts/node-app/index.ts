import * as express from 'express';
import * as core from 'express-serve-static-core';
import {getRouter as getTopicRouter, Options, getDestinationAuthReqRes, ConnectedEventParams, ConnectionsManager, ClientSendMsgEventParams} from 'rcf-message-router';
import {IGlobal} from '../global';
import {Dispatcher} from '../dispatcher'; 
import {GridMessage, INode, INodeReady, ITask} from 'grid-client-core';

let router = express.Router();

let destAuthApp = express();

destAuthApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    let {authReq, authRes} = getDestinationAuthReqRes(req, res);
})

let options: Options = {
    pingIntervalMS: 10000
    ,dispatchMsgOnClientSend: false
    ,destinationAuthorizeApp: destAuthApp
};

let topicRouter = getTopicRouter('/event_stream', options);
router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

let routerEventEmitter = topicRouter.eventEmitter;
let connectionsManager = topicRouter.connectionsManager;

let getDispatcher = (req:any) : Dispatcher => {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

routerEventEmitter.on('client_connect', (params: ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress + ' connected to the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    let node:INode = {id: params.conn_id, name: params.remoteAddress};
    dispatcher.addNewNode(node);
});

routerEventEmitter.on('client_disconnect', (params: ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    dispatcher.removeNode(params.conn_id);
});

routerEventEmitter.on('on_client_send_msg', (params: ClientSendMsgEventParams) => {
    let dispatcher = getDispatcher(params.req);
    let nodeId = params.conn_id;
    if (params.destination === '/topic/dispatcher') {
        let msg:GridMessage = params.body;
        if (msg.type === 'node-ready') {
            let nodeReady: INodeReady = msg.content;
            dispatcher.markNodeReady(nodeId, nodeReady);
        } else if (msg.type === 'task-complete') {
            let task: ITask = msg.content;
            dispatcher.onNodeCompleteTask(nodeId, task);
        }
    }
});

export {router as Router, connectionsManager as ConnectionsManager};