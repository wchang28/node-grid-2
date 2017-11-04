import {ITransactionReceiver} from "msg-transaction-processor";
import * as events from 'events';

export interface NodeMsgTransactionReceiver extends ITransactionReceiver {
    onReceivedQueryStatusMsg(msg: any): void;
}

class Receiver extends events.EventEmitter implements NodeMsgTransactionReceiver {
    constructor() {
        super();
    }
    onReceivedQueryStatusMsg(msg: any) {
        let TransactionId = null;
        let result = null;
        this.emit("transaction-res-rcvd", TransactionId, result);
    }
}

export function receiver() : NodeMsgTransactionReceiver {return new Receiver();}