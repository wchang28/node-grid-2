
import {Dispatcher, INodeMessenger} from "./dispatcher";
import {IServerGridDB} from "./gridDB";
import {GridAutoScaler} from 'grid-autoscaler';
import {NodeMsgTransactionReceiver} from "./node-msg-trans-rcvr";
import {IMsgTransactionProcessor} from "msg-transaction-processor";

export interface IGlobal {
    dispatcher: Dispatcher;
    gridDB: IServerGridDB;
    nodeMessenger: INodeMessenger;
    nodeMsgTransReceiver: NodeMsgTransactionReceiver;
    nodeMsgTransProcessor: IMsgTransactionProcessor;
    gridAutoScaler?: GridAutoScaler;
}