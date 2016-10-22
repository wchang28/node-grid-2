import * as express from 'express';
import * as core from 'express-serve-static-core';
import * as tr from 'rcf-message-router';
import {IGlobal} from '../global';
import {Dispatcher} from '../dispatcher'; 
import {GridMessage, INode, INodeReady, ITask} from 'grid-client-core';

let router = express.Router();

let destAuthRouter = new tr.DestinationAuthRouter();

// allow node to send message to /topic/dispatcher
destAuthRouter.use('/topic/dispatcher', (req: tr.DestAuthRequest, res: tr.DestAuthResponse) => {
    if (req.authMode === tr.DestAuthMode.SendMsg)
        res.accept();
    else
        res.reject();
});

// allow the node to subscribe to it's own topic
destAuthRouter.use('/topic/node/:nodeId', (req: tr.DestAuthRequest, res: tr.DestAuthResponse) => {
    if (req.authMode === tr.DestAuthMode.Subscribe && req.conn_id === req.params[':nodeId'])
        res.accept();
    else
        res.reject();
}); 

let options: tr.Options = {
    pingIntervalMS: 10000
    ,dispatchMsgOnClientSend: false
    ,destinationAuthorizeRouter: destAuthRouter
};

let topicRouter = tr.getRouter('/event_stream', options);
router.use('/events', topicRouter); // topic subscription endpoint is available at /events/event_stream from this route

let routerEventEmitter = topicRouter.eventEmitter;
let connectionsManager = topicRouter.connectionsManager;

let getDispatcher = (req:any) : Dispatcher => {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

routerEventEmitter.on('client_connect', (params: tr.ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress + ' connected to the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    let node:INode = {id: params.conn_id, name: params.remoteAddress};
    dispatcher.addNewNode(node);
});

routerEventEmitter.on('client_disconnect', (params: tr.ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    dispatcher.removeNode(params.conn_id);
});

routerEventEmitter.on('on_client_send_msg', (params: tr.ClientSendMsgEventParams) => {
    let dispatcher = getDispatcher(params.req);
    let nodeId = params.conn_id;
    if (params.data.destination === '/topic/dispatcher') {
        let msg:GridMessage = params.data.body;
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