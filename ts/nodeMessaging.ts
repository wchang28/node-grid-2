import {ConnectionsManager} from 'sse-topic-router';
import {GridMessage, ITask} from './messaging';

export class NodeMessaging {
    constructor(private nodeAppConnectionsManager: ConnectionsManager) {
    }
    dispatchTaskToNode(nodeId: string, task: ITask, done: (err: any) => void): void {
        let msg: GridMessage = {
            type: 'launch-task'
            ,content: task
        };
        this.nodeAppConnectionsManager.injectMessage('/topic/node/' + nodeId, {}, msg,  done);
    }
    killProcessesTree(nodeId: string, pids:number[], done: (err: any) => void): void {
        let msg: GridMessage = {
            type: 'kill-processes-tree'
            ,content: pids
        };
        this.nodeAppConnectionsManager.injectMessage('/topic/node/' + nodeId, {}, msg,  done);
    }
}