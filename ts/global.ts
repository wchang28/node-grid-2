
import {Dispatcher, INodeMessenger} from "./dispatcher";
import {IServerGridDB} from "./gridDB";
import {GridAutoScaler} from 'grid-autoscaler';
import {NodeMsgTransactionReceiver} from "./node-msg-trans-rcvr";

export interface IGlobal {
    dispatcher: Dispatcher;
    gridDB: IServerGridDB;
    nodeMsgTransReceiver: NodeMsgTransactionReceiver;
    gridAutoScaler?: GridAutoScaler;
}