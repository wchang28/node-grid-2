import * as events from 'events';
let EventSource = require('eventsource');
let $ = require('jquery-no-dom');
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {ClientMessaging} from './clientMessaging';
import {GridMessage, IJobProgress} from './messaging';

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

// job submission class
class JobSubmmit {
    constructor(private __dispatcherConfig: IGridDispatcherConfig, private __accessToken: string, private jobSubmit:IGridJobSubmit) {}
    private makeJobXML(jobSubmit:IGridJobSubmit) : string {
        // TODO:
        return '';
    }
    submit(done: (err:any, jobId:string) => void, notificationCookie:string=null) : void {
        let xml = this.makeJobXML(this.jobSubmit);
        if (typeof this.__dispatcherConfig.rejectUnauthorized === 'boolean') $.ajax.defaults({rejectUnauthorized: this.__dispatcherConfig.rejectUnauthorized});
        let settings:any = {
            type: "POST"
            ,url: this.__dispatcherConfig.url + (notificationCookie ? '?nc=' +  notificationCookie : '')
            ,contentType: 'text/xml'
            ,data: xml
            ,dataType: 'json'
        };
        if (this.__accessToken) settings.headers = {'Authorization': 'Bearer ' + this.__accessToken};
        let p = $.ajax(settings);
        // TODO:
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
class GridJob extends events.EventEmitter {
    private __jobId:string = null;
    private __msgBorker: MsgBroker = null;
    constructor(dispatcherConfig: IGridDispatcherConfig, accessToken:string, private __js:JobSubmmit) {
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
                        this.emit('done', jp);
                    }
                }
            }
            ,{}
            ,(err: any) => {
                if (err) {
                    console.error('!!! Error:' + JSON.stringify(err));
                } else {    // subscription successful
                    this.__js.submit((err:any, jobId:string) => {
                        if (!this.__jobId) {
                            this.__jobId = jobId;
                            this.emit('job-id', this.__jobId);
                        }
                    }, conn_id);
                }
            });
        });
        this.__msgBorker.on('error', (err: any) : void => {
            console.error('!!! Error:' + JSON.stringify(err));
        });
    }
    get jobId() : string {return this.__jobId;}
    run() {this.__msgBorker.connect();}
}

export interface ISession {
    runJob: (jobSubmit:IGridJobSubmit) => IGridJob;
    sumbitJob: (jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) => void;
    logout : () => void;
}

class Session {
    constructor(private __dispatcherConfig: IGridDispatcherConfig, private __accessToken: string) {}
    runJob(jobSubmit:IGridJobSubmit) : IGridJob {
        let js = new JobSubmmit(this.__dispatcherConfig, this.__accessToken, jobSubmit);
        return new GridJob(this.__dispatcherConfig, this.__accessToken, js);
    }
    sumbitJob(jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) : void {
        let js = new JobSubmmit(this.__dispatcherConfig, this.__accessToken, jobSubmit);
        js.submit(done);
    }
    logout() : void {}
}

export class GridClient {
    constructor(private __config: IGridClientConfig) {}
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        // Do auth
        let accessToken = null;
        let session = new Session(this.__config.dispatcherConfig, accessToken);
        done(null, session);
    }
}