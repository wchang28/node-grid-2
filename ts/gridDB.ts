import * as events from 'events';
import {IGridUser, IJobProgress, IJobInfo, ITask, INodeRunningProcess, IRunningProcessByNode, ITaskExecParams, ITaskExecResult} from './messaging';
//import {SimpleMSSQL, Configuration} from './simpleMSSQL';
import {SimpleMSSQL, Configuration} from 'mssql-simple';
import {DOMParser, XMLSerializer} from 'xmldom';
import * as _ from 'lodash';

export {Configuration as SQLConfiguration} from './simpleMSSQL';

export interface IGridDBOptions {
    reconnectIntervalMS?: number;
}

// will emit the following events
// 1. connected
// 2. error
// 3. disconnected
export class GridDB extends events.EventEmitter {
    private __ssql: SimpleMSSQL;
    private static defaultOptions: IGridDBOptions = {
        reconnectIntervalMS: 5000
    };
    private initOptions(options:IGridDBOptions) : IGridDBOptions {
        options = (options || GridDB.defaultOptions);
        options = _.assignIn({}, GridDB.defaultOptions, options);
        options.reconnectIntervalMS = Math.max(1000, options.reconnectIntervalMS);
        return options;
    }
    constructor(sqlConfig: Configuration, options: IGridDBOptions = null) {
        super();
        options = this.initOptions(options);
        this.__ssql = new SimpleMSSQL(sqlConfig, options.reconnectIntervalMS);
        this.__ssql.on('connected', () => {
            this.emit('connected');
        }).on('error', (err:any) => {
            this.emit('error', err);
        }).on('disconnected', () => {
            this.emit('disconnected');
        });
    }
    private get ssql(): SimpleMSSQL {return this.__ssql;}
    connect() {this.ssql.connect();}
    disconnect() {this.ssql.disconnect();}
    registerNewJob(user: IGridUser, jobXML: string, done:(err:any, jobProgress: IJobProgress) => void) : void {
        this.ssql.execute('[dbo].[stp_NodeJSGridSubmitJob]', {'userId': user.userId, 'priority': user.priority, 'jobXML': jobXML}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let ret = recordsets[0][0];
                if (ret.err != 0) {
                    done(ret.error, null);
                } else {
                    let ret = recordsets[1][0];
                    done(null, ret);
                }
            }
        });
    }
    reSubmitJob(user: IGridUser, oldJobId: string, failedTasksOnly: boolean, done:(err:any, jobProgress: IJobProgress) => void) : void {
        let params = {
            'userId': user.userId
            ,'priority': user.priority
            ,'oldJobId': oldJobId
            ,'failedTasksOnly': failedTasksOnly
        };
        this.ssql.execute('[dbo].[stp_NodeJSGridReSubmitJob]', params, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let ret = recordsets[0][0];
                if (ret.err != 0) {
                    done(ret.error, null);
                } else {
                    let ret = recordsets[1][0];
                    done(null, ret);
                }
            }
        });
    }
    getJobProgress(jobId:string, done:(err:any, jobProgress: IJobProgress) => void) : void {
        this.ssql.query('select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)', {'jobId': jobId}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let dt = recordsets[0];
                if (dt.length === 0)
                    done('bad job', null);
                else
                    done(null, dt[0]);
            }
        });
    }
    getMultiJobsProgress(jobIds:string[], done:(err:any, jobsProgress: IJobProgress[]) => void) : void {
        let doc = new DOMParser().parseFromString('<?xml version="1.0"?>','text/xml');
        let root = doc.createElement('jobs');
        doc.appendChild(root);
        for (let i in jobIds) {
            let jobId = jobIds[i];
            let el = doc.createElement('j');
            el.setAttribute('i', jobId);
            root.appendChild(el);
        }
        let serializer = new XMLSerializer();
        let xml = serializer.serializeToString(doc);
        this.ssql.query('select * from [dbo].[fnc_NodeJSGridMultiJobsProgress](@xml)', {'xml': xml}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else
                done(null, recordsets[0]);
        });
    }
    getJobInfo(jobId:string, done:(err:any, jobInfo: IJobInfo) => void) : void {
        this.ssql.query('select * from [dbo].[fnc_NodeJSGridGetJobInfo](@jobId)', {'jobId': jobId}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let dt = recordsets[0];
                if (dt.length === 0)
                    done('bad job', null);
                else
                    done(null, dt[0]);
            }
        });
    }
    killJob(jobId:string, markJobAborted: boolean, done:(err:any, runningProcess: IRunningProcessByNode, jobProgress: IJobProgress) => void) : void {
        let params = {
            'jobId': jobId
            ,'markJobAborted': markJobAborted
        };
        this.ssql.execute('[dbo].[stp_NodeJSKillJob]', params, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null, null);
            else {
                let dt = recordsets[0];
                let runningProcess: IRunningProcessByNode = {};
                for (let i in dt) {    // for each row
                    let rp:INodeRunningProcess = dt[i];
                    let nodeId = rp.nodeId;
                    if (!runningProcess[nodeId]) runningProcess[nodeId] = [];
                    runningProcess[nodeId].push(rp.pid);
                }
                dt = recordsets[1];
                if (dt.length === 0)
                    done('bad job', {}, null);
                else
                    done(null, runningProcess, dt[0]);
            }
        });
    }
    getTaskExecParams(task:ITask, nodeId: string, nodeName: string, done:(err:any, taskExecParams: ITaskExecParams) => void) : void {
         let params = {
            'jobId': task.j
            ,'taskIndex': task.t
            ,'nodeId': nodeId
            ,'nodeName': nodeName
        };       
        this.ssql.execute('[dbo].[stp_NodeJSGridJobTask]', params, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let ret = recordsets[0][0];
                done(null, ret);
            }
        });
    }
    markTaskStart(task:ITask, pid:number, done:(err:any) => void) : void {
        this.ssql.execute('[dbo].[stp_NodeJSGridJobTask]', {'jobId': task.j, 'taskIndex': task.t, 'pid': pid}, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
    markTaskEnd(task:ITask, result: ITaskExecResult, done:(err:any) => void) : void {
        let params = {
            'jobId': task.j
            ,'taskIndex': task.t
            ,'pid': result.pid
            ,'retCode': result.retCode
            ,'stdout': result.stdout
            ,'stderr': result.stderr
        };
        this.ssql.execute('[dbo].[stp_NodeJSGridJobTask]', params, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
}