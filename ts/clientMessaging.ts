import {ConnectionsManager} from 'rcf-msg-router';
import {GridMessage, IJobProgress, IQueueJSON, INodeItem, IDispControl, Utils} from 'grid-client-core';

export class ClientMessaging {
    constructor(private connectionsManager: ConnectionsManager) {}

    notifyClientsQueueChanged(queue: IQueueJSON, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'queue-changed'
            ,content: queue
        };
        this.connectionsManager.injectMessage(Utils.getDispatcherTopic(), {}, msg, done);
    }
    notifyClientsNodesChanged(nodes: INodeItem[], done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'nodes-changed'
            ,content: nodes
        };
        this.connectionsManager.injectMessage(Utils.getDispatcherTopic(), {}, msg, done);
    }
    notifyClientsDispControlChanged(dispControl: IDispControl, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'ctrl-changed'
            ,content: dispControl
        };
        this.connectionsManager.injectMessage(Utils.getDispatcherTopic(), {}, msg, done);
    }

    notifyClientsJobsTrackingChanged(done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'tracking-changed'
            ,content: {}
        };
        this.connectionsManager.injectMessage(Utils.getJobsTrackingTopic(), {}, msg, done);
    }

    notifyClientsConnectionsChanged(connections:any, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'connections-changed'
            ,content: connections
        };
        this.connectionsManager.injectMessage(Utils.getConnectionsTopic(), {}, msg, done);
    }

    notifyClientsJobStatusChanged(jobProgress: IJobProgress, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'status-changed'
            ,content: jobProgress
        };
        this.connectionsManager.injectMessage(Utils.getJobNotificationTopic(jobProgress.jobId), {}, msg, done);
    }
}