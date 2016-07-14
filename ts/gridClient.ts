import * as events from 'events';
let EventSource = (global['EventSource'] || require('eventsource'));
import {getAJaxon, IAjaxon, ICompletionHandler} from 'ajaxon'; 
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {ClientMessaging} from './clientMessaging';
import {GridMessage, IJobProgress} from './messaging';
import {DOMParser, XMLSerializer} from 'xmldom';
import {IDispatcherJSON, INodeItem} from './dispatcher';

export interface IOAuth2Config {
    tokenGrantUrl: string;
    rejectUnauthorized?: boolean;
}

export interface IGridDispatcherConfig {
    baseUrl?: string;
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

class ApiCallBase extends events.EventEmitter {
    protected __$J: IAjaxon = null;
    constructor(protected $:any, protected __dispatcherConfig: IGridDispatcherConfig, protected __accessToken: string) {
        super();
        this.__$J = getAJaxon($);
    }
    get dispatcherConfig() : IGridDispatcherConfig {return this.__dispatcherConfig;}
    get accessToken() : string {return this.__accessToken;}
    protected get baseUrl() : string {
        return (this.__dispatcherConfig && this.__dispatcherConfig.baseUrl ? this.__dispatcherConfig.baseUrl : "");
    }
    protected get authHeaders() : {[field:string]:string} {
        return (this.__accessToken ? {'Authorization': 'Bearer ' + this.__accessToken} : null)
    }
    protected getUrl(path:string) : string {
        return this.baseUrl + path;
    }
    protected get rejectUnauthorized() : boolean {
        return (this.__dispatcherConfig ? this.__dispatcherConfig.rejectUnauthorized : null);
    }
    protected $J(method:string, path:string, data:any, done: ICompletionHandler) {
        return this.__$J(method, this.getUrl(path), data, done, this.authHeaders, this.rejectUnauthorized);
    }
    protected $M(reconnectIntervalMS?: number): MsgBroker {
        let eventSourceUrl = this.getUrl('/services/events/event_stream');
        let eventSourceInitDict:any = {};
        if (typeof this.rejectUnauthorized === 'boolean') eventSourceInitDict.rejectUnauthorized = this.rejectUnauthorized;
        eventSourceInitDict.headers = this.authHeaders;
        return new MsgBroker(() => new MessageClient(EventSource, this.$, eventSourceUrl, eventSourceInitDict), reconnectIntervalMS);        
    }
}

interface IJobSubmitter {
    submit: (notificationCookie:string, done: (err:any, jobId:string) => void) => void;
}

// job submission class
class JobSubmmit extends ApiCallBase implements IJobSubmitter {
    constructor($:any, dispatcherConfig: IGridDispatcherConfig, accessToken: string, private __jobSubmit:IGridJobSubmit) {
        super($, dispatcherConfig, accessToken);
    }
    private static makeJobXML(jobSubmit:IGridJobSubmit) : string {
        if (!jobSubmit || !jobSubmit.tasks || jobSubmit.tasks.length === 0) {
            throw "no tasks for job";
        }
        let doc = new DOMParser().parseFromString('<?xml version="1.0"?>','text/xml');
        let root = doc.createElement('job');
        if (jobSubmit.description) root.setAttribute('description', jobSubmit.description);
        if (jobSubmit.cookie) root.setAttribute('cookie', jobSubmit.cookie);
        doc.appendChild(root);
        for (let i in jobSubmit.tasks) {
            let task = jobSubmit.tasks[i];
            let el = doc.createElement('t');
            if (!task.cmd) throw 'cmd not optional for task';
            el.setAttribute('c', task.cmd);
            if (task.cookie) el.setAttribute('k', task.cookie);
            if (task.stdin) el.setAttribute('i', task.stdin);
            root.appendChild(el);
        }
        let serializer = new XMLSerializer();
        return serializer.serializeToString(doc);
    }
    submit(notificationCookie:string, done: (err:any, jobId:string) => void) : void {
        let xml = null;
        try {
            xml = JobSubmmit.makeJobXML(this.__jobSubmit);
        } catch(e) {
            done(e, null);
            return;
        }
        if (typeof this.rejectUnauthorized === 'boolean') this.$.ajax.defaults({rejectUnauthorized: this.rejectUnauthorized});
        let url = this.getUrl('/services/job/submit' + (notificationCookie ? '?nc=' +  notificationCookie : ''));
        let settings:any = {
            type: "POST"
            ,url: url
            ,contentType: 'text/xml'
            ,data: xml
            ,dataType: 'json'
        };
        settings.headers = this.authHeaders;
        let p = this.$.ajax(settings);
        p.done((data: any) => {
            done(null, data['jobId']);
        }).fail((err: any) => {
            done(err, null);
        });
    }
}

// job re-submission class
class JobReSubmmit extends ApiCallBase implements IJobSubmitter {
    constructor($:any, dispatcherConfig: IGridDispatcherConfig, accessToken: string, private __oldJobId:string, private __failedTasksOnly:boolean) {
        super($, dispatcherConfig, accessToken);
    }
    submit(notificationCookie:string, done: (err:any, jobId:string) => void) : void {
        let path = '/services/job/' + this.__oldJobId + '/re_submit';
        let data:any = {
            failedTasksOnly: (this.__failedTasksOnly ? '1' : '0')
        };
        if (notificationCookie) data.nc = notificationCookie;
        this.$J('GET', path, data, (err: any, ret: any) => {
            done(err, (err ? null: ret['jobId']));
        });
    }
}

export interface IGridJob {
    jobId?:string;
    run: () => void;
    on: (event: string, listener: Function) => this;
};

// will emit the follwoing events:
// 1. submitted
// 2. status-changed
// 3. done
// 4. error
class GridJob extends ApiCallBase implements IGridJob {
    private __jobId:string = null;
    private __msgBorker: MsgBroker = null;
    constructor($:any, dispatcherConfig: IGridDispatcherConfig, accessToken:string, private __js:IJobSubmitter) {
        super($, dispatcherConfig, accessToken);
        this.__msgBorker = this.$M(2000);
        this.__msgBorker.on('connect', (conn_id:string) : void => {
            this.__msgBorker.subscribe(ClientMessaging.getClientJobNotificationTopic(conn_id), (msg: IMessage) => {
                //console.log('msg-rcvd: ' + JSON.stringify(msg));
                let gMsg: GridMessage = msg.body;
                if (gMsg.type === 'status-changed') {
                    let jp: IJobProgress = gMsg.content;
                    if (!this.__jobId) {
                        this.__jobId = jp.jobId;
                        this.emit('submitted', this.__jobId);
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
                                this.emit('submitted', this.__jobId);
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
    createMsgBroker: (reconnectIntervalMS?: number) => MsgBroker;
    runJob: (jobSubmit:IGridJobSubmit) => IGridJob;
    sumbitJob: (jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) => void;
    reRunJob: (oldJobId:string, failedTasksOnly:boolean) => IGridJob;
    reSumbitJob: (oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobId:string) => void) => void;
    getDispatcherJSON: (done: (err:any, dispatcherJSON: IDispatcherJSON) => void) => void;
    getConnections: (done: (err:any, connections: any) => void) => void;
    setNodeEnabled: (nodeId:string, enabled: boolean, done: (err:any, nodeItem: INodeItem) => void) => void;
    logout : () => void;
}

class Session extends ApiCallBase implements ISession {
    constructor($:any, dispatcherConfig: IGridDispatcherConfig, accessToken: string) {
        super($, dispatcherConfig, accessToken);
    }
    createMsgBroker (reconnectIntervalMS?: number) : MsgBroker {
        return this.$M(reconnectIntervalMS);
    }
    runJob(jobSubmit:IGridJobSubmit) : IGridJob {
        let js = new JobSubmmit(this.$, this.dispatcherConfig, this.accessToken, jobSubmit);
        return new GridJob(this.$, this.dispatcherConfig, this.accessToken, js);
    }
    sumbitJob(jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) : void {
        let js = new JobSubmmit(this.$, this.dispatcherConfig, this.accessToken, jobSubmit);
        js.submit(null, done);
    }
    reRunJob(oldJobId:string, failedTasksOnly:boolean) : IGridJob {
        let js = new JobReSubmmit(this.$, this.dispatcherConfig, this.accessToken, oldJobId, failedTasksOnly);
        return new GridJob(this.$, this.dispatcherConfig, this.accessToken, js);
    }
    reSumbitJob(oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobId:string) => void) : void {
        let js = new JobReSubmmit(this.$, this.dispatcherConfig, this.accessToken, oldJobId, failedTasksOnly);
        js.submit(null, done);
    }
    getDispatcherJSON(done: (err:any, dispatcherJSON: IDispatcherJSON) => void) : void {
        this.$J("GET", '/services/dispatcher', {}, done);
    }
    getConnections(done: (err:any, connections: any) => void) : void {
        this.$J("GET", '/services/connections', {}, done);
    }
    setNodeEnabled(nodeId:string, enabled: boolean, done: (err:any, nodeItem: INodeItem) => void): void {
        let path = "/services/dispatcher/node/" + nodeId + "/" + (enabled? "enable": "disable");
        this.$J("GET", path, {}, done);
    }
    logout() : void {}
}

export class GridClient {
    constructor(private $:any, private __config: IGridClientConfig) {}
    static webSession($:any) : ISession {
        return new Session($, null, null);
    }
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        // TODO: Do auth
        let accessToken = null;
        let session = new Session(this.$, this.__config.dispatcherConfig, accessToken);
        done(null, session);
    }
}

export {IJobProgress};