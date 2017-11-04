// route /services/node
import * as express from 'express';
import * as core from 'express-serve-static-core';
import {IGlobal} from '../../global';
import {INodeMessenger} from "../../dispatcher";
import {TransactionId, ITransaction, IMsgTransactionProcessor} from "msg-transaction-processor";
import {NodeQueryStatus} from "grid-client-core";

let router = express.Router();

export {router as Router};

let getNodeMessenger = (req: any): INodeMessenger => {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.nodeMessenger;
}

let getNodeTransactionProcessor = (req: any): IMsgTransactionProcessor => {
    let request: express.Request = req;
    let g:IGlobal = request.app.get('global');
    return g.nodeMsgTransProcessor;
}

class NodeQueryStatusTransaction implements ITransaction {
    constructor(private nodeMessenger: INodeMessenger, private nodeId: string) {}
    sendRequest(TransactionId: TransactionId): Promise<any> {
        this.nodeMessenger.queryNodeStatus(this.nodeId, TransactionId);
        return Promise.resolve<any>({});
    }
    toJSON() : any {
        return {
            nodeId: this.nodeId
        };
    }
}

router.get("/:nodeId", (req: express.Request, res: express.Response) => {
    let transProcessor = getNodeTransactionProcessor(req);
    let nodeMessenger = getNodeMessenger(req);
    let nodeId = <string>req.params["nodeId"];
    transProcessor.execute<NodeQueryStatus>(new NodeQueryStatusTransaction(nodeMessenger, nodeId))
    .then((value: NodeQueryStatus) => {
        res.jsonp(value);
    }).catch((err: any) => {
        res.status(400).json(err);
    });
});