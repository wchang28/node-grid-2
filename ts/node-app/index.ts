import * as express from 'express';
import * as core from 'express-serve-static-core';
import * as tr from 'rcf-message-router';
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
    if (req.connection.id == req.params['nodeId'])
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

let ret = tr.get('/event_stream', options);
router.use('/events', ret.router); // topic subscription endpoint is available at /events/event_stream from this route

let connectionsManager = ret.connectionsManager;

let getDispatcher = (req:any) : Dispatcher => {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.dispatcher;
}

connectionsManager.on('client_connect', (req:express.Request, connection: tr.ITopicConnection) : void => {
    console.log('node ' + connection.id + ' @ ' + connection.remoteAddress + ' connected to the SSE topic endpoint');
    let dispatcher = getDispatcher(req);
    let node:INode = {id: connection.id, name: connection.remoteAddress};
    dispatcher.addNewNode(node);
}).on('client_disconnect', (req:express.Request, connection: tr.ITopicConnection) : void => {
    console.log('node ' + connection.id + ' @ ' + connection.remoteAddress +  ' disconnected from the SSE topic endpoint');
    let dispatcher = getDispatcher(req);
    dispatcher.removeNode(connection.id);
}).on('on_client_send_msg', (req:express.Request, connection: tr.ITopicConnection, params: tr.SendMsgParams) => {
    let dispatcher = getDispatcher(req);
    let nodeId = connection.id;
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