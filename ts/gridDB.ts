import * as events from 'events';
import {IGridUserProfile, IGridUser, IJobProgress, IJobInfo, IJobResult, ITask, INodeRunningProcess, IRunningProcessByNode, ITaskExecParams, ITaskExecResult} from './messaging';
import {SimpleMSSQL, Configuration, Options} from 'mssql-simple';
import {DOMParser, XMLSerializer} from 'xmldom';
export {Configuration as SQLConfiguration, Options as DBOptions} from 'mssql-simple';
import * as errors from './errors';

// will emit the following events
// 1. connected
// 2. error
// 3. disconnected
export class GridDB extends SimpleMSSQL {
    constructor(sqlConfig: Configuration, options?:Options) {
        super(sqlConfig, options);
    }
    private static sqlEscapeString(str:string) {return str.replace(new RegExp("'", "gi"), "''");}
    getUserProfile(userId: string, done:(err:any, profile: IGridUserProfile) => void) : void {
        this.execute('[dbo].[stp_NodeJSGridGetUserProfile]', {userId}, (err:any, recordsets:any[]) => {
            if (err)
                done(err, null);
            else {
                let dt = recordsets[0];
                if (dt.length === 0) {
                    done(errors.bad_user_profile, null);
                } else
                    done(null, dt[0]);
           }
        });
    }
    /*
    registerNewJob(user: IGridUser, jobXML: string, done:(err:any, jobProgress: IJobProgress) => void) : void {
        this.execute('[dbo].[stp_NodeJSGridSubmitJob]', {'userId': user.userId, 'priority': user.profile.priority, 'jobXML': jobXML}, (err: any, recordsets: any) : void => {
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
    */
    registerNewJob(user: IGridUser, jobXML: string, done:(err:any, jobProgress: IJobProgress) => void) : void {
        let sql = "exec [dbo].[stp_NodeJSGridSubmitJob]";
        sql += " @userId='" + GridDB.sqlEscapeString(user.userId) + "'";
        sql += ",@priority=" + GridDB.sqlEscapeString(user.profile.priority.toString());
        sql += ",@jobXML='" + GridDB.sqlEscapeString(jobXML) + "'";
        this.query(sql, {}, (err: any, recordsets: any) : void => {
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
            ,'priority': user.profile.priority
            ,'oldJobId': oldJobId
            ,'failedTasksOnly': failedTasksOnly
        };
        this.execute('[dbo].[stp_NodeJSGridReSubmitJob]', params, (err: any, recordsets: any) : void => {
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
        this.query('select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)', {'jobId': jobId}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let dt = recordsets[0];
                if (dt.length === 0)
                    done(errors.bad_job_id, null);
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
        this.query('select * from [dbo].[fnc_NodeJSGridMultiJobsProgress](@xml)', {'xml': xml}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else
                done(null, recordsets[0]);
        });
    }
    getJobInfo(jobId:string, done:(err:any, jobInfo: IJobInfo) => void) : void {
        this.query('select * from [dbo].[fnc_NodeJSGridGetJobInfo](@jobId)', {'jobId': jobId}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let dt = recordsets[0];
                if (dt.length === 0)
                    done(errors.bad_job_id, null);
                else
                    done(null, dt[0]);
            }
        });
    }
    getJobResult(jobId:string, done:(err:any, jobResult: IJobResult) => void) : void {
        this.execute('[dbo].[stp_NodeJSGetJobResult]', {'jobId': jobId}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let dt = recordsets[0];
                if (dt.length === 0)
                    done(errors.bad_job_id, null);
                else
                    done(null, dt);
            }
        });
    }
    killJob(jobId:string, markJobAborted: boolean, done:(err:any, runningProcess: IRunningProcessByNode, jobProgress: IJobProgress) => void) : void {
        let params = {
            'jobId': jobId
            ,'markJobAborted': markJobAborted
        };
        this.execute('[dbo].[stp_NodeJSKillJob]', params, (err: any, recordsets: any) : void => {
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
                    done(errors.bad_job_id, {}, null);
                else
                    done(null, runningProcess, dt[0]);
            }
        });
    }
    getMostRecentJobs(done:(err:any, jobInfos: IJobInfo[]) => void) : void {
        this.execute('[dbo].[stp_NodeJSGetMostRecentJobs]', {}, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else
                done(null, recordsets[0]);
        });
    }
    getTaskExecParams(task:ITask, nodeId: string, nodeName: string, done:(err:any, taskExecParams: ITaskExecParams) => void) : void {
         let params = {
            'jobId': task.j
            ,'taskIndex': task.t
            ,'nodeId': nodeId
            ,'nodeName': nodeName
        };       
        this.execute('[dbo].[stp_NodeJSGridJobTask]', params, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let ret = recordsets[0][0];
                done(null, ret);
            }
        });
    }
    markTaskStart(task:ITask, pid:number, done:(err:any) => void) : void {
        this.execute('[dbo].[stp_NodeJSGridJobTask]', {'jobId': task.j, 'taskIndex': task.t, 'pid': pid}, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
    /*
    markTaskEnd(task:ITask, result: ITaskExecResult, done:(err:any) => void) : void {
        let params = {
            'jobId': task.j
            ,'taskIndex': task.t
            ,'pid': result.pid
            ,'retCode': result.retCode
            ,'stdout': result.stdout
            ,'stderr': result.stderr
        };
        this.execute('[dbo].[stp_NodeJSGridJobTask]', params, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
    */
    markTaskEnd(task:ITask, result: ITaskExecResult, done:(err:any) => void) : void {
        let params = {
            'jobId': task.j
            ,'taskIndex': task.t
            ,'pid': result.pid
            ,'retCode': result.retCode
            ,'stdout': result.stdout
            ,'stderr': result.stderr
        };
        let sql = "exec [dbo].[stp_NodeJSGridJobTask]";
        sql += " @jobId=" + GridDB.sqlEscapeString(task.j);
        sql += ",@taskIndex=" + GridDB.sqlEscapeString(task.t.toString());
        sql += ",@pid=" + GridDB.sqlEscapeString(result.pid.toString());
        sql += ",@retCode=" + GridDB.sqlEscapeString(result.retCode.toString());
        sql += ",@stdout='" + GridDB.sqlEscapeString(result.stdout) + "'";
        sql += ",@stderr='" + GridDB.sqlEscapeString(result.stderr) + "'";
        this.query(sql, {}, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
}