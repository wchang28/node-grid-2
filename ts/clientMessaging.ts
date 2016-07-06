import {ConnectionsManager} from 'sse-topic-router';
import {GridMessage, IJobProgress} from './messaging';
import {IDispatcherJSON} from './dispatcher';

export class ClientMessaging {
    constructor(private connectionsManager: ConnectionsManager) {}
    static getDispatcherTopic() : string {
        return '/topic/dispatcher';
    }
    notifyClientsDispatcherChanged(dispatcherJSON: IDispatcherJSON, done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'changed'
            ,content: dispatcherJSON
        };
        this.connectionsManager.injectMessage(ClientMessaging.getDispatcherTopic(), {}, msg, done);
    }
    notifyClientsJobsTrackingChanged(trackingJobs: IJobProgress[], done: (err:any) => void) : void {
        let msg: GridMessage = {
            type: 'jobs-tracking-changed'
            ,content: trackingJobs
        };
        this.connectionsManager.injectMessage(ClientMessaging.getDispatcherTopic(), {}, msg, done);
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