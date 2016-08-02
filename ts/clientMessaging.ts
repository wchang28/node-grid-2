import {ConnectionsManager} from 'sse-topic-router';
import {GridMessage, IJobProgress} from './messaging';
import {IQueueJSON, INodeItem, IDispControl} from './dispatcher';

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

    static getClientJobNotificationTopic(notificationCookie: string) : string {
        return '/topic/job/' + notificationCookie;
    }
    notifyClientsJobStatusChanged(notificationCookies:string[], jobProgress: IJobProgress, done: (err:any) => void) : void {
        if (notificationCookies && notificationCookies.length > 0) {
            let msg: GridMessage = {
                type: 'status-changed'
                ,content: jobProgress
            };
            let errors = [];
            function getHandler(i: number) : (err: any) => void  {
                return (err: any): void => {
                    if (err) errors.push(err);
                    if (i < notificationCookies.length-1)
                        this.connectionsManager.injectMessage(ClientMessaging.getClientJobNotificationTopic(notificationCookies[i+1]), {}, msg, getHandler(i+1));
                    else
                        done(errors.length > 0 ? errors : null);
                }
            }
            this.connectionsManager.injectMessage(ClientMessaging.getClientJobNotificationTopic(notificationCookies[0]), {}, msg, getHandler(0));
        }
    }
}