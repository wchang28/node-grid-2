import * as events from 'events';
let EventSource = require('eventsource');
let $ = require('jquery-no-dom');
import * as ajaxon from 'ajaxon'; 
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {ClientMessaging} from './clientMessaging';
import {GridMessage, IJobProgress} from './messaging';

let $J = ajaxon($);

interface ICompletionHandler {
    (err: any, ret: any) : void;
}

interface IAjaxon {
    (method: string, url: string, data:any, done: ICompletionHandler, headers?: any, rejectUnauthorized?:boolean) : void;
}

export interface IOAuth2Config {
    tokenGrantUrl: string
}

export interface IGridDispatcherConfig {
    url: string;
    rejectUnauthorized?: boolean;
}

export interface IGridClientConfig {
    oauth2Config: IOAuth2Config;
    dispatcherConfig: IGridDispatcherConfig;
}

export interface ITaskItem {
    cmd: string;
    cookie?: string;
    stdin?: string;
}

export interface IGridJobSubmit {
    description?: string;
    cookie?: string;
    tasks: ITaskItem[];
}

interface IJobSubmit {
    submit: (notificationCookie:string, done: (err:any, jobId:string) => void) => void;
}

// job submission class
class JobSubmmit implements IJobSubmit {
    constructor(private __dispatcherConfig: IGridDispatcherConfig, private __accessToken: string, private __jobSubmit:IGridJobSubmit) {}
    private static makeJobXML(jobSubmit:IGridJobSubmit) : string {
        // TODO:
        return '';
    }
    submit(notificationCookie:string, done: (err:any, jobId:string) => void) : void {
        let xml = JobSubmmit.makeJobXML(this.__jobSubmit);
        if (typeof this.__dispatcherConfig.rejectUnauthorized === 'boolean') $.ajax.defaults({rejectUnauthorized: this.__dispatcherConfig.rejectUnauthorized});
        let settings:any = {
            type: "POST"
            ,url: this.__dispatcherConfig.url + '/services/job/submit' + (notificationCookie ? '?nc=' +  notificationCookie : '')
            ,contentType: 'text/xml'
            ,data: xml
            ,dataType: 'json'
        };
        if (this.__accessToken) settings.headers = {'Authorization': 'Bearer ' + this.__accessToken};
        let p = $.ajax(settings);
        p.done((data: any) => {
            done(null, data['jobId']);
        }).fail((err: any) => {
            done(err, null);
        });
    }
}

// job re-submission class
class JobReSubmmit implements IJobSubmit {
    constructor(private __dispatcherConfig: IGridDispatcherConfig, private __accessToken: string, private __oldJobId:string, private __failedTasksOnly:boolean) {}
    submit(notificationCookie:string, done: (err:any, jobId:string) => void) : void {
        let headers:{[field:string]: string} = null;
        if (this.__accessToken) headers = {'Authorization': 'Bearer ' + this.__accessToken};
        let url = this.__dispatcherConfig.url + '/services/job/' + this.__oldJobId + '/re_submit';
        let data:any = {
            failedTasksOnly: (this.__failedTasksOnly ? '1' : '0')
        };
        if (notificationCookie) data.nc = notificationCookie;
        $J('GET', url, data, (err: any, ret: any) => {
            done(err, (err ? null: ret['jobId']));
        }, headers, this.__dispatcherConfig.rejectUnauthorized);
    }
}

export interface IGridJob {
    jobId?:string;
    run: () => void;
    on: (event: string, listener: Function) => this;
};

// will emit the follwoing events:
// 1. job-id
// 2. status-changed
// 3. done
// 4. error
class GridJob extends events.EventEmitter implements IGridJob {
    private __jobId:string = null;
    private __msgBorker: MsgBroker = null;
    constructor(dispatcherConfig: IGridDispatcherConfig, accessToken:string, private __js:IJobSubmit) {
        super();
        let eventSourceUrl = dispatcherConfig.url + '/services/events/event_stream';
        let eventSourceInitDict:any = {};
        if (typeof dispatcherConfig.rejectUnauthorized === 'boolean') eventSourceInitDict.rejectUnauthorized = dispatcherConfig.rejectUnauthorized;
        if (accessToken)  eventSourceInitDict.headers = {'Authorization': 'Bearer ' + accessToken};
        this.__msgBorker = new MsgBroker(() => new MessageClient(EventSource, $, eventSourceUrl, eventSourceInitDict), 10000);
        this.__msgBorker.on('connect', (conn_id:string) : void => {
            this.__msgBorker.subscribe(ClientMessaging.getClientJobNotificationTopic(conn_id), (msg: IMessage) => {
                //console.log('msg-rcvd: ' + JSON.stringify(msg));
                let gMsg: GridMessage = msg.body;
                if (gMsg.type === 'status-changed') {
                    let jp: IJobProgress = gMsg.content;
                    if (!this.__jobId) {
                        this.__jobId = jp.jobId;
                        this.emit('job-id', this.__jobId);
                    }
                    this.emit('status-changed', jp);
                    if (jp.status === 'FINISHED' || jp.status === 'ABORTED') {
                        this.__msgBorker.disconnect();
                        this.emit('done', jp);
                    }
                }
            }
            ,{}
            ,(err: any) => {
                if (err) {  // topic subscription failed
                    this.__msgBorker.disconnect();
                    this.emit('error', err);
                } else {    // topic subscription successful
                    // submit the job
                    this.__js.submit(conn_id, (err:any, jobId:string) => {
                        if (err) {  // submit failed
                            this.__msgBorker.disconnect();
                            this.emit('error', err);
                        } else {    // submit successful
                            if (!this.__jobId) {
                                this.__jobId = jobId;
                                this.emit('job-id', this.__jobId);
                            }
                        }
                    });
                }
            });
        });
        this.__msgBorker.on('error', (err: any) : void => {
            this.__msgBorker.disconnect();
            this.emit('error', err);
        });
    }

    get jobId() : string {return this.__jobId;}

    run() : void {this.__msgBorker.connect();}
}

export interface ISession {
    runJob: (jobSubmit:IGridJobSubmit) => IGridJob;
    sumbitJob: (jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) => void;
    reRunJob: (oldJobId:string, failedTasksOnly:boolean) => IGridJob;
    reSumbitJob: (oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobId:string) => void) => void;
    logout : () => void;
}

class Session implements ISession {
    constructor(private __dispatcherConfig: IGridDispatcherConfig, private __accessToken: string) {}
    runJob(jobSubmit:IGridJobSubmit) : IGridJob {
        let js = new JobSubmmit(this.__dispatcherConfig, this.__accessToken, jobSubmit);
        return new GridJob(this.__dispatcherConfig, this.__accessToken, js);
    }
    sumbitJob(jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) : void {
        let js = new JobSubmmit(this.__dispatcherConfig, this.__accessToken, jobSubmit);
        js.submit(null, done);
    }
    reRunJob(oldJobId:string, failedTasksOnly:boolean) : IGridJob {
        let js = new JobReSubmmit(this.__dispatcherConfig, this.__accessToken, oldJobId, failedTasksOnly);
        return new GridJob(this.__dispatcherConfig, this.__accessToken, js);
    }
    reSumbitJob(oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobId:string) => void) : void {
        let js = new JobReSubmmit(this.__dispatcherConfig, this.__accessToken, oldJobId, failedTasksOnly);
        js.submit(null, done);
    }
    logout() : void {}
}

export class GridClient {
    constructor(private __config: IGridClientConfig) {}
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        // TODO: Do auth
        let accessToken = null;
        let session = new Session(this.__config.dispatcherConfig, accessToken);
        done(null, session);
    }
}