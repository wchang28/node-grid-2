import {ConnectionsManager} from 'rcf-msg-router';
import {GridMessage, IJobProgress, IQueueJSON, INodeItem, IDispControl} from './messaging';

export class ClientMessaging {
    constructor(private connectionsManager: ConnectionsManager) {}

    static getDispatcherTopic() : string {
        return '/topic/dispatcher';
    }
    notifyClientsQueueChanged(queue: IQueueJSON, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'queue-changed'
            ,content: queue
        };
        this.connectionsManager.injectMessage(ClientMessaging.getDispatcherTopic(), {}, msg, done);
    }
    notifyClientsNodesChanged(nodes: INodeItem[], done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'nodes-changed'
            ,content: nodes
        };
        this.connectionsManager.injectMessage(ClientMessaging.getDispatcherTopic(), {}, msg, done);
    }
    notifyClientsDispControlChanged(dispControl: IDispControl, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'ctrl-changed'
            ,content: dispControl
        };
        this.connectionsManager.injectMessage(ClientMessaging.getDispatcherTopic(), {}, msg, done);
    }

    static getJobsTrackingTopic() : string {
        return '/topic/jobs-tracking';
    }
    notifyClientsJobsTrackingChanged(done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'tracking-changed'
            ,content: {}
        };
        this.connectionsManager.injectMessage(ClientMessaging.getJobsTrackingTopic(), {}, msg, done);
    }

    static getConnectionsTopic() : string {
        return '/topic/connections';
    }
    notifyClientsConnectionsChanged(connections:any, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'connections-changed'
            ,content: connections
        };
        this.connectionsManager.injectMessage(ClientMessaging.getConnectionsTopic(), {}, msg, done);
    }

    static getJobNotificationTopic(jobId:string) : string {
        return '/topic/job/' + jobId;
    }
    notifyClientsJobStatusChanged(jobProgress: IJobProgress, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'status-changed'
            ,content: jobProgress
        };
        this.connectionsManager.injectMessage(ClientMessaging.getJobNotificationTopic(jobProgress.jobId), {}, msg, done);
    }
}