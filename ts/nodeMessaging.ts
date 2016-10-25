import {ConnectionsManager} from 'rcf-message-router-2';
import {GridMessage, ITask} from 'grid-client-core';

export class NodeMessaging {
    constructor(private nodeAppConnectionsManager: ConnectionsManager) {
    }
    dispatchTaskToNode(nodeId: string, task: ITask, done: (err: any) => void): void {
        let msg: GridMessage = {
            type: 'launch-task'
            ,content: task
        };
        this.nodeAppConnectionsManager.dispatchMessage('/topic/node/' + nodeId, {}, msg,  done);
    }
    killProcessesTree(nodeId: string, pids:number[], done: (err: any) => void): void {
        let msg: GridMessage = {
            type: 'kill-processes-tree'
            ,content: pids
        };
        this.nodeAppConnectionsManager.dispatchMessage('/topic/node/' + nodeId, {}, msg,  done);
    }
}