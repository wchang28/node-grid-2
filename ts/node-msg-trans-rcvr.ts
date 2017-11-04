import {ITransactionReceiver} from "msg-transaction-processor";
import * as events from 'events';
import {NodeQueryStatusResponse} from 'grid-client-core';

export interface NodeMsgTransactionReceiver extends ITransactionReceiver {
    onReceivedNodeQueryStatusResponse(response: NodeQueryStatusResponse): void;
}

class Receiver extends events.EventEmitter implements NodeMsgTransactionReceiver {
    constructor() {
        super();
    }
    onReceivedNodeQueryStatusResponse(response: NodeQueryStatusResponse) {
        let TransactionId = response.QueryId;
        let result = response.Status;
        this.emit("transaction-res-rcvd", TransactionId, result);
    }
}

export function receiver() : NodeMsgTransactionReceiver {return new Receiver();}