import {IConnectionsManager} from 'rcf-message-router';
import {GridMessage, ITask} from 'grid-client-core';
import {INodeMessaging} from './dispatcher';

export class NodeMessaging implements INodeMessaging {
    constructor(private nodeAppConnectionsManager: IConnectionsManager) {
    }
    dispatchTaskToNode(nodeId: string, task: ITask, done:(err:any) => void): void {
        let msg: GridMessage = {
            type: 'launch-task'
            ,content: task
        };
        this.nodeAppConnectionsManager.dispatchMessage('/topic/node/' + nodeId, {}, msg);
        if (typeof done === 'function') done(null);
    }
    killProcessesTree(nodeId: string, pids:number[], done:(err:any) => void): void {
        let msg: GridMessage = {
            type: 'kill-processes-tree'
            ,content: pids
        };
        this.nodeAppConnectionsManager.dispatchMessage('/topic/node/' + nodeId, {}, msg);
       if (typeof done === 'function') done(null);
    }
}