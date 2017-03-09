import * as events from 'events';
import {IGridUserProfile, IGridUser, IGridJobSubmit, IJobProgress, IJobInfo, IJobResult, ITask, INodeRunningProcess, IRunningProcessByNode, ITaskExecParams, ITaskExecResult, ITaskResult} from 'grid-client-core';
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

    // return DB time
    getTime() : Promise<number> {
        return new Promise<number>((resolve: (value: number) => void, reject: (err: any) => void) => {
            this.query('select [time]=getdate()', {}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let time: Date = recordsets[0][0]['time'];
                    resolve(time.getTime());
                }
            });
        });
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
    registerNewJob(user: IGridUser, jobSubmit:IGridJobSubmit, done:(err:any, jobProgress: IJobProgress) => void) : void {
        let sql = "exec [dbo].[stp_NodeJSGridSubmitJob]";
        sql += " @userId='" + GridDB.sqlEscapeString(user.userId) + "'";
        sql += ",@userName=" + GridDB.sqlEscapeString(user.displayName.toString());
        sql += ",@priority=" + GridDB.sqlEscapeString(user.profile.priority.toString());
        let xml = GridDB.makeJobXML(jobSubmit);
        sql += ",@jobXML='" + GridDB.sqlEscapeString(xml) + "'";
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
            ,'userName': user.displayName
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
        sql += " @jobId=" + GridDB.sqlEscapeString(task.j.toString());
        sql += ",@taskIndex=" + GridDB.sqlEscapeString(task.t.toString());
        sql += ",@pid=" + (typeof result.pid === 'number' ? GridDB.sqlEscapeString(result.pid.toString()) : 'null');
        sql += ",@retCode=" + (typeof result.retCode === 'number' ? GridDB.sqlEscapeString(result.retCode.toString()) : 'null');
        sql += ",@stdout=" + (result.stdout ? "'" + GridDB.sqlEscapeString(result.stdout) + "'" : 'null');
        sql += ",@stderr=" + (result.stderr ? "'" + GridDB.sqlEscapeString(result.stderr) + "'" : 'null');
        this.query(sql, {}, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
    getTaskResult(task: ITask, done: (err:any, taskResult:ITaskResult) => void) {
        let params = {
            'jobId': task.j
            ,'taskIndex': task.t
        };
        this.execute('[dbo].[stp_NodeJSGridGetTaskResult]', params, (err: any, recordsets: any) : void => {
            if (err)
                done(err, null);
            else {
                let ret = recordsets[0][0];
                if (!ret)
                    done(errors.bad_task_index, null);
                else
                    done(null, ret);
            }
        });  
    }
}