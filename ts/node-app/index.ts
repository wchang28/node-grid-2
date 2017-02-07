import * as express from 'express';
import * as core from 'express-serve-static-core';
import * as tr from 'rcf-message-router-2';
import {IGlobal} from '../global';
import {Dispatcher} from '../dispatcher'; 
import {GridMessage, INode, INodeReady, ITask} from 'grid-client-core';

let router = express.Router();

let topicRouter = express.Router();

// allow node only to send message to /topic/dispatcher
topicRouter.route('/dispatcher').post(tr.destAuth((req: tr.DestAuthRequest, res:tr.DestAuthResponse) => {
    res.accept();
})).get(tr.destAuth((req: tr.DestAuthRequest, res:tr.DestAuthResponse) => {
    res.reject();
}));

// allow the node to subscribe to it's own topic (topic/node/:nodeId)
topicRouter.route('/node/:nodeId').post(tr.destAuth((req: tr.DestAuthRequest, res:tr.DestAuthResponse) => {
    res.reject();
})).get(tr.destAuth((req: tr.DestAuthRequest, res:tr.DestAuthResponse) => {
    if (req.conn_id == req.params['nodeId'])
        res.accept();
    else
        res.reject();
}));

let destAuthRouter = express.Router();
destAuthRouter.use('/topic', topicRouter);

let options: tr.Options = {
    connKeepAliveIntervalMS: 10000
    ,dispatchMsgOnClientSend: false
    ,destinationAuthorizeRouter: destAuthRouter
};

let msgRouter = tr.getRouter('/event_stream', options);
router.use('/events', msgRouter); // topic subscription endpoint is available at /events/event_stream from this route

let routerEventEmitter = msgRouter.eventEmitter;
let connectionsManager = msgRouter.connectionsManager;

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
}).on('client_disconnect', (params: tr.ConnectedEventParams) : void => {
    console.log('node ' + params.conn_id + ' @ ' + params.remoteAddress +  ' disconnected from the SSE topic endpoint');
    let dispatcher = getDispatcher(params.req);
    dispatcher.removeNode(params.conn_id);
}).on('on_client_send_msg', (params: tr.ClientSendMsgEventParams) => {
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