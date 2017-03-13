import {IConnectionsManager} from 'rcf-message-router';
import {GridMessage, IJobProgress, ITask, IQueueJSON, INodeItem, IDispControl, Utils} from 'grid-client-core';

export class ClientMessaging {
    constructor(private connectionsManager: IConnectionsManager) {}

    notifyClientsQueueChanged(queue: IQueueJSON) : void {
        let msg: GridMessage = {
            type: 'queue-changed'
            ,content: queue
        };
        this.connectionsManager.dispatchMessage(Utils.getDispatcherTopic(), {}, msg);
    }
    notifyClientsNodesChanged(nodes: INodeItem[]) : void {
        let msg: GridMessage = {
            type: 'nodes-changed'
            ,content: nodes
        };
        this.connectionsManager.dispatchMessage(Utils.getDispatcherTopic(), {}, msg);
    }
    notifyClientsDispControlChanged(dispControl: IDispControl) : void {
        let msg: GridMessage = {
            type: 'ctrl-changed'
            ,content: dispControl
        };
        this.connectionsManager.dispatchMessage(Utils.getDispatcherTopic(), {}, msg);
    }

    notifyClientsJobsTrackingChanged() : void {
        let msg: GridMessage = {
            type: 'tracking-changed'
            ,content: {}
        };
        this.connectionsManager.dispatchMessage(Utils.getJobsTrackingTopic(), {}, msg);
    }

    notifyClientsConnectionsChanged(connections:any) : void {
        let msg: GridMessage = {
            type: 'connections-changed'
            ,content: connections
        };
        this.connectionsManager.dispatchMessage(Utils.getConnectionsTopic(), {}, msg);
    }

    notifyClientsJobStatusChanged(jobProgress: IJobProgress) : void {
        let msg: GridMessage = {
            type: 'status-changed'
            ,content: jobProgress
        };
        this.connectionsManager.dispatchMessage(Utils.getJobNotificationTopic(jobProgress.jobId), {}, msg);
    }

    notifyClientsTaskComplete(task:ITask) : void {
        let msg: GridMessage = {
            type: 'task-complete'
            ,content: task
        };
        this.connectionsManager.dispatchMessage(Utils.getJobNotificationTopic(task.j), {}, msg);
    }

    notifyClientsAutoScalerChanged() : void {
        let msg: GridMessage = {
            type: 'change'
            ,content: {}
        };
        this.connectionsManager.dispatchMessage(Utils.getAutoScalerTopic(), {}, msg);        
    }
}