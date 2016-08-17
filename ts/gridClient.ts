import * as rcf from 'rcf';
import {GridMessage, IJobProgress, IJobInfo, IJobResult, IGridUser, IGridJobSubmit, IDispatcherJSON, INodeItem, IQueueJSON, IDispControl} from './messaging';
import * as oauth2 from 'oauth2';
import * as errors from './errors';
import {Utils} from './utils';

interface IJobSubmitter {
    submit: (done: (err:any, jobProgress:IJobProgress) => void) => void;
}

let eventStreamPathname = '/services/events/event_stream';
let clientOptions: rcf.IMessageClientOptions = {reconnetIntervalMS: 10000};

// job submission class
class JobSubmmit extends rcf.AuthorizedRestApi implements IJobSubmitter {
    constructor($drver: rcf.$Driver, access:oauth2.Access, tokenGrant: oauth2.ITokenGrant, private __jobSubmit:IGridJobSubmit) {
        super($drver, access, tokenGrant);
    }
    submit(done: (err:any, jobProgress:IJobProgress) => void) : void {
        this.$J('POST', '/services/job/submit', this.__jobSubmit, (err:any, ret:any) => {
            done(err, (err ? null: ret));
        });
    }
}

// job re-submission class
class JobReSubmmit extends rcf.AuthorizedRestApi implements IJobSubmitter {
    constructor($drver: rcf.$Driver, access:oauth2.Access, tokenGrant: oauth2.ITokenGrant, private __oldJobId:string, private __failedTasksOnly:boolean) {
        super($drver, access, tokenGrant);
    }
    submit(done: (err:any, jobProgress:IJobProgress) => void) : void {
        let path = Utils.getJobOpPath(this.__oldJobId, 're_submit');
        let data:any = {
            failedTasksOnly: (this.__failedTasksOnly ? '1' : '0')
        };
        this.$J('GET', path, data, (err: any, ret: any) => {
            done(err, (err ? null: ret));
        });
    }
}

export interface IGridJob {
    jobId?:string;
    run() : void;
    on: (event: string, listener: Function) => this;
};

// will emit the follwoing events:
// 1. submitted (jobId)
// 2. status-changed (jobProgress)
// 3. done (jobProgress)
// 4. error
class GridJob extends rcf.AuthorizedRestApi implements IGridJob {
    private __jobId:string = null;
    constructor($drver: rcf.$Driver, access:oauth2.Access, tokenGrant: oauth2.ITokenGrant, private __js:IJobSubmitter) {
        super($drver, access, tokenGrant);
    }
    private static jobDone(jobProgress: IJobProgress) : boolean {
        return (jobProgress.status === 'FINISHED' || jobProgress.status === 'ABORTED');
    }
    private onError(msgClient: rcf.IMessageClient, err:any) : void {
        this.emit('error', err);
        if (msgClient) msgClient.disconnect();
    }
    // returns true if job is still running, false otherwise
    private onJobProgress(msgClient: rcf.IMessageClient, jp: IJobProgress) : boolean {
        this.emit('status-changed', jp);
        if (Utils.jobDone(jp)) {
            if (msgClient) msgClient.disconnect();
            this.emit('done', jp);
            return false;
        } else
            return true;
    }
    run(): void {
        // submit the job
        this.__js.submit((err:any, jobProgress: IJobProgress) => {
            if (err) {  // submit failed
                this.onError(null, err);
            } else {    // submit successful
                this.__jobId = jobProgress.jobId;
                this.emit('submitted', this.__jobId);
                if (this.onJobProgress(null, jobProgress)) {
                    let msgClient = this.$M(eventStreamPathname, clientOptions);

                    msgClient.on('connect', (conn_id:string) : void => {
                        msgClient.subscribe(Utils.getJobNotificationTopic(this.jobId), (msg: rcf.IMessage) => {   // TODO:
                            //console.log('msg-rcvd: ' + JSON.stringify(msg));
                            let gMsg: GridMessage = msg.body;
                            if (gMsg.type === 'status-changed') {
                                let jobProgress: IJobProgress = gMsg.content;
                                this.onJobProgress(msgClient, jobProgress);
                            }
                        }
                        ,{}
                        ,(err: any) => {
                            if (err) {  // topic subscription failed
                                this.onError(msgClient, err);
                            } else {  // topic subscription successful
                                let path = Utils.getJobOpPath(this.jobId, 'progress');
                                this.$J("GET", path, {}, (err:any, jobProgress:IJobProgress) => {
                                    this.onJobProgress(msgClient, jobProgress);
                                });
                            }
                        });
                    });

                    msgClient.on('error', (err: any) : void => {
                        this.onError(msgClient, err);
                    });
                }
            }
        });
    }

    get jobId() : string {return this.__jobId;}
}

export interface ISession {
    createMsgClient: () => rcf.IMessageClient;
    runJob: (jobSubmit:IGridJobSubmit) => IGridJob;
    sumbitJob: (jobSubmit:IGridJobSubmit, done: (err:any, jobProgress:IJobProgress) => void) => void;
    reRunJob: (oldJobId:string, failedTasksOnly:boolean) => IGridJob;
    reSumbitJob: (oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobProgress:IJobProgress) => void) => void;
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

export class Session extends rcf.AuthorizedRestApi {
    constructor($drver: rcf.$Driver, access: oauth2.Access, tokenGrant: oauth2.ITokenGrant) {
        super($drver, access, tokenGrant);
    }
    createMsgClient() : rcf.IMessageClient {
        return this.$M(eventStreamPathname, clientOptions);
    }
    runJob(jobSubmit:IGridJobSubmit) : IGridJob {
        let js = new JobSubmmit(this.$driver, this.access, this.tokenGrant, jobSubmit);
        return new GridJob(this.$driver, this.access, this.tokenGrant, js);
    }
    sumbitJob(jobSubmit:IGridJobSubmit, done: (err:any, jobProgress:IJobProgress) => void) : void {
        let js = new JobSubmmit(this.$driver, this.access, this.tokenGrant, jobSubmit);
        js.submit(done);
    }
    reRunJob(oldJobId:string, failedTasksOnly:boolean) : IGridJob {
        let js = new JobReSubmmit(this.$driver, this.access, this.tokenGrant, oldJobId, failedTasksOnly);
        return new GridJob(this.$driver, this.access, this.tokenGrant, js);
    }
    reSumbitJob(oldJobId:string, failedTasksOnly:boolean, done: (err:any, jobProgress:IJobProgress) => void) : void {
        let js = new JobReSubmmit(this.$driver, this.access, this.tokenGrant, oldJobId, failedTasksOnly);
        js.submit(done);
    }
    getMostRecentJobs(done: (err:any, jobInfos:IJobInfo[]) => void) : void {
        this.$J("GET", '/services/job/most_recent', {}, done);
    }
    killJob(jobId: string, done: (err:any, ret:any) => void) : void {
        let path = Utils.getJobOpPath(jobId, 'kill');
        this.$J("GET", path, {}, done);
    }
    getJobProgress(jobId: string, done: (err:any, jobProgress:IJobProgress) => void) : void {
        let path = Utils.getJobOpPath(jobId, 'progress');
        this.$J("GET", path, {}, done);
    }
    getJobInfo(jobId: string, done: (err:any, jobInfo:IJobInfo) => void) : void {
        let path = Utils.getJobOpPath(jobId, 'info');
        this.$J("GET", path, {}, done);
    }
    getJobResult(jobId: string, done: (err:any, jobResult:IJobResult) => void) : void {
        let path = Utils.getJobOpPath(jobId, 'result');
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
        let path = Utils.getNodePath(nodeId, (enabled ? "enable": "disable"));
        this.$J("GET", path, {}, done);
    }
}


import * as $node from 'rest-node';

class GridNodeSession extends Session implements ISession {
    constructor(access: oauth2.Access, tokenGrant: oauth2.ITokenGrant) {
        super($node.get(), access, tokenGrant);
    }
    logout(done?:(err:any) => void) : void {
        let path = "/logout";
        this.$J("GET", path, {}, (typeof done=== 'function' ? done : (err:any, ret: any) => {}));
    }
}

export interface IGridClientConfig {
    oauth2Options: oauth2.ClientAppOptions;
}

/*
export class GridNodeClient {
    private tokenGrant: oauth2.TokenGrant = null;
    constructor(private jQuery:any, private __config: IGridClientConfig) {
        this.tokenGrant = new oauth2.TokenGrant(this.jQuery, __config.oauth2Options.tokenGrantOptions, __config.oauth2Options.clientAppSettings);
    }
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        this.tokenGrant.getAccessTokenFromPassword(username, password, (err, access: oauth2.Access) => {
            if (err) {
                done(err, null);
            } else {
                let session = new GridNodeSession(this.tokenGrant, access);
                done(null, session);
            }
        });
    }
}
*/

