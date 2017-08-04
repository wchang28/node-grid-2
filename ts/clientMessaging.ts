import {IConnectionsManager} from 'rcf-message-router';
import {GridMessage, IJobProgress, ITask, IQueueJSON, INodeItem, IDispControl, Utils} from 'grid-client-core';

export class ClientMessaging {
    constructor(private connectionsManager: IConnectionsManager) {}

    notifyClientsQueueChanged(queue: IQueueJSON) : void {
        let msg: GridMessage = {
            type: 'queue-changed'
            ,content: queue
        };
        this.connectionsManager.dispatchMessage(Utils.getDispatcherTopic(), {type: 'queue-changed'}, msg);
    }
    notifyClientsNodesChanged(nodes: INodeItem[]) : void {
        let msg: GridMessage = {
            type: 'nodes-changed'
            ,content: nodes
        };
        this.connectionsManager.dispatchMessage(Utils.getDispatcherTopic(), {type: 'nodes-changed'}, msg);
    }
    notifyClientsDispControlChanged(dispControl: IDispControl) : void {
        let msg: GridMessage = {
            type: 'ctrl-changed'
            ,content: dispControl
        };
        this.connectionsManager.dispatchMessage(Utils.getDispatcherTopic(), {type: 'ctrl-changed'}, msg);
    }

    notifyClientsJobsTrackingChanged() : void {
        let msg: GridMessage = {
            type: 'tracking-changed'
            ,content: {}
        };
        this.connectionsManager.dispatchMessage(Utils.getJobsTrackingTopic(), {type: 'tracking-changed'}, msg);
    }

    notifyClientsConnectionsChanged(connections:any) : void {
        let msg: GridMessage = {
            type: 'connections-changed'
            ,content: connections
        };
        this.connectionsManager.dispatchMessage(Utils.getConnectionsTopic(), {type: 'connections-changed'}, msg);
    }

    notifyClientsJobStatusChanged(jobProgress: IJobProgress) : void {
        let msg: GridMessage = {
            type: 'status-changed'
            ,content: jobProgress
        };
        this.connectionsManager.dispatchMessage(Utils.getJobNotificationTopic(jobProgress.jobId), {type: 'status-changed'}, msg);
    }

    notifyClientsJobDone(jobId: string) : void {
        let msg: GridMessage = {
            type: 'job-done'
            ,content: jobId
        };
        this.connectionsManager.dispatchMessage(Utils.getJobNotificationTopic(jobId), {type: 'job-done'}, msg);
    }

    notifyClientsTaskComplete(task:ITask) : void {
        let msg: GridMessage = {
            type: 'task-complete'
            ,content: task
        };
        this.connectionsManager.dispatchMessage(Utils.getJobNotificationTopic(task.j), {type: 'task-complete'}, msg);
    }

    notifyClientsAutoScalerChanged() : void {
        let msg: GridMessage = {
            type: 'autoscaler-changed'
            ,content: {}
        };
        this.connectionsManager.dispatchMessage(Utils.getAutoScalerTopic(), {type: 'autoscaler-changed'}, msg);        
    }

    notifyClientsAutoScalerImplementationChanged() : void {
        let msg: GridMessage = {
            type: 'autoscaler-implementation-changed'
            ,content: {}
        };
        this.connectionsManager.dispatchMessage(Utils.getAutoScalerImplementationTopic(), {type: 'autoscaler-implementation-changed'}, msg);        
    }
}