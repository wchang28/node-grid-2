import * as events from 'events';
let EventSource = (global['EventSource'] || require('eventsource'));
import {getAJaxon, IAjaxon, ICompletionHandler} from 'ajaxon'; 
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {ClientMessaging} from './clientMessaging';
import {GridMessage, IJobProgress, IJobInfo, IJobResult, IGridUser} from './messaging';
import {DOMParser, XMLSerializer} from 'xmldom';
import {IDispatcherJSON, INodeItem, IQueueJSON, IDispControl} from './dispatcher';
import * as oauth2 from 'oauth2';
import * as errors from './errors';
import * as resIntf from 'rest-api-interfaces';

export interface IGridClientConfig {
    oauth2Options: oauth2.ClientAppOptions;
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
    constructor(protected $:any, protected __access: oauth2.Access) {
        super();
        this.__$J = getAJaxon($);
    }
    get access() : oauth2.Access {return this.__access;}
    protected get instance_url() : string {
        return (this.__access && this.__access.instance_url ? this.__access.instance_url : "");
    }
    protected get authHeaders() : {[field:string]:string} {
        return (this.__access ? {'Authorization': this.__access.token_type + ' ' + this.__access.access_token} : null)
    }
    protected getUrl(path:string) : string {
        return this.instance_url + path;
    }
    protected get rejectUnauthorized() : boolean {
        return (this.__access ? this.__access.rejectUnauthorized : null);
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
    constructor($:any, access:oauth2.Access, private __jobSubmit:IGridJobSubmit) {
        super($, access);
    }
    private static makeJobXML(jobSubmit:IGridJobSubmit) : string {
        if (!jobSubmit || !jobSubmit.tasks || jobSubmit.tasks.length === 0) {
            throw errors.no_task_for_job;
        }
        let doc = new DOMParser().parseFromString('<?xml version="1.0"?>','text/xml');
        let root = doc.createElement('job');
        if (jobSubmit.description) root.setAttribute('description', jobSubmit.description);
        if (jobSubmit.cookie) root.setAttribute('cookie', jobSubmit.cookie);
        doc.appendChild(root);
        for (let i in jobSubmit.tasks) {
            let task = jobSubmit.tasks[i];
            let el = doc.createElement('t');
            if (!task.cmd) throw errors.bad_task_cmd;
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

// returns operation path for job
function getJobOpPath(jobId:string, op:string):string {return '/services/job/' + jobId + '/' + op;}

// job re-submission class
class JobReSubmmit extends ApiCallBase implements IJobSubmitter {
    constructor($:any, access:oauth2.Access, private __oldJobId:string, private __failedTasksOnly:boolean) {
        super($, access);
    }
    submit(notificationCookie:string, done: (err:any, jobId:string) => void) : void {
        let path = getJobOpPath(this.__oldJobId, 're_submit');
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
    constructor($:any, access:oauth2.Access, private __js:IJobSubmitter) {
        super($, access);
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
    getMostRecentJobs: (done: (err:any, jobInfos:IJobInfo[]) => void) => void;
    killJob: (jobId: string, done: (err:any, ret:any) => void) => void;
    getJobProgress: (jobId: string, done: (err:any, jobProgress:IJobProgress) => void) => void;
    getJobInfo: (jobId: string, done: (err:any, jobInfo:IJobInfo) => void) => void;
    getJobResult: (jobId: string, done: (err:any, jobResult:IJobResult) => void) => void;
    getDispatcherJSON: (done: (err:any, dispatcherJSON: IDispatcherJSON) => void) => void;
    setDispatchingEnabled: (enabled: boolean, done: (err:any, dispControl: IDispControl) => void) => void; 
    setQueueOpened: (open: boolean, done: (err:any, dispControl: IDispControl) => void) => void;
    getConnections: (done: (err:any, connections: any) => void) => void;
    setNodeEnabled: (nodeId:string, enabled: boolean, done: (err:any, nodeItem: INodeItem) => void) => void;
    logout: (done?:(err:any) => void) => void;
}

class Session extends ApiCallBase implements ISession {
    constructor($:any, access: oauth2.Access) {
        super($, access);
    }
    createMsgBroker (reconnectIntervalMS?: number) : MsgBroker {
        return this.$M(reconnectIntervalMS);
    }
    runJob(jobSubmit:IGridJobSubmit) : IGridJob {
        let js = new JobSubmmit(this.$, this.access, jobSubmit);
        return new GridJob(this.$, this.access, js);
    }
    sumbitJob(jobSubmit:IGridJobSubmit, done: (err:any, jobId:string) => void) : void {
        let js = new JobSubmmit(this.$, this.access, jobSubmit);
        js.submit(null, done);
    }
    reRunJob(oldJobId:string, failedTasksOnly:boolean) : IGridJob {
        let js = new JobReSubmmit(this.$, this.access, oldJobId, failedTasksOnly);
        return new GridJob(this.$, this.access, js);
    }
    reSumbitJob(oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobId:string) => void) : void {
        let js = new JobReSubmmit(this.$, this.access, oldJobId, failedTasksOnly);
        js.submit(null, done);
    }
    getMostRecentJobs(done: (err:any, jobInfos:IJobInfo[]) => void) : void {
        this.$J("GET", '/services/job/most_recent', {}, done);
    }
    killJob(jobId: string, done: (err:any, ret:any) => void) : void {
        let path = getJobOpPath(jobId, 'kill');
        this.$J("GET", path, {}, done);
    }
    getJobProgress(jobId: string, done: (err:any, jobProgress:IJobProgress) => void) : void {
        let path = getJobOpPath(jobId, 'progress');
        this.$J("GET", path, {}, done);
    }
    getJobInfo(jobId: string, done: (err:any, jobInfo:IJobInfo) => void) : void {
        let path = getJobOpPath(jobId, 'info');
        this.$J("GET", path, {}, done);
    }
    getJobResult(jobId: string, done: (err:any, jobResult:IJobResult) => void) : void {
        let path = getJobOpPath(jobId, 'result');
        this.$J("GET", path, {}, done);
    }
    getDispatcherJSON(done: (err:any, dispatcherJSON: IDispatcherJSON) => void) : void {
        this.$J("GET", '/services/dispatcher', {}, done);
    }
    setDispatchingEnabled(enabled: boolean, done: (err:any, dispControl: IDispControl) => void): void {
        let path = "/services/dispatcher/dispatching/" + (enabled? "start": "stop");
        this.$J("GET", path, {}, done);
    }
    setQueueOpened(open: boolean, done: (err:any, dispControl: IDispControl) => void): void {
        let path = "/services/dispatcher/queue/" + (open? "open": "close");
        this.$J("GET", path, {}, done);
    }
    getConnections(done: (err:any, connections: any) => void) : void {
        this.$J("GET", '/services/connections', {}, done);
    }
    setNodeEnabled(nodeId:string, enabled: boolean, done: (err:any, nodeItem: INodeItem) => void): void {
        let path = "/services/dispatcher/node/" + nodeId + "/" + (enabled? "enable": "disable");
        this.$J("GET", path, {}, done);
    }
    logout(done?:(err:any) => void) : void {
        let path = "/logout";
        if (global["window"])  // browser logout
            window.location.href = path;
        else    // automation client logout
            this.$J("GET", path, {}, (typeof done=== 'function' ? done : (err:any, ret: any) => {}));
    }
}

export class GridClient {
    private tokenGrant: oauth2.TokenGrant = null;
    constructor(private jQuery:any, private __config: IGridClientConfig) {
        this.tokenGrant = new oauth2.TokenGrant(this.jQuery, __config.oauth2Options.tokenGrantOptions, __config.oauth2Options.clientAppSettings);
    }
    static webSession(jQuery:any) : ISession {
        return new Session(jQuery, null);
    }
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        this.tokenGrant.getAccessTokenFromPassword(username, password, (err, access: oauth2.Access) => {
            if (err) {
                done(err, null);
            } else {
                let session = new Session(this.jQuery, access);
                done(null, session);
            }
        });
    }
}

export {MsgBroker, IMessage, GridMessage, ClientMessaging, IJobProgress, IJobInfo, IJobResult, IGridUser, IDispatcherJSON, INodeItem, IDispControl, IQueueJSON};