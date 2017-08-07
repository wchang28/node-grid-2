import * as events from 'events';
import {IGridUserProfile, IGridUser, IGridJobSubmit, IJobProgress, IJobInfo, IJobResult, ITask, INodeRunningProcess, IRunningProcessByNode, ITaskExecParams, ITaskExecResult, ITaskResult} from 'grid-client-core';
import * as sql from 'simple-mssql';
import {DOMParser, XMLSerializer} from 'xmldom';
export {config, Options} from 'simple-mssql';
import * as errors from './errors';
import {IDsipatcherGridDB, JobKillStatus} from "./dispatcher";
import {ITaskLauncherGridDBImpl} from "./launcherApp";

export interface IServerGridDBImpl extends IDsipatcherGridDB {
    getUserProfile(userId: string) : Promise<IGridUserProfile>;
    getTime() : Promise<number>;
}

export interface IServerGridDB extends IServerGridDBImpl, sql.ISimpleMSSQL {}
export interface ITaskLauncherGridDB extends ITaskLauncherGridDBImpl, sql.ISimpleMSSQL {}

class GridDB extends sql.SimpleMSSQL implements IServerGridDBImpl, ITaskLauncherGridDBImpl, sql.ISimpleMSSQL {
    constructor(sqlConfig: sql.config, options?:sql.Options) {
        super(sqlConfig, options);
    }
    private static sqlEscapeString(str:string) {return str.replace(new RegExp("'", "gi"), "''");}

    getUserProfile(userId: string) : Promise<IGridUserProfile> {
        return this.execute("[dbo].[stp_NodeJSGridGetUserProfile]", {userId})
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            let dt = recordsets[0];
            if (dt.length === 0)
                return Promise.reject(errors.bad_user_profile);
            else
                return Promise.resolve<IGridUserProfile>(dt[0]);
        });
    }
    // return DB time
    getTime() : Promise<number> {
        return this.query('select [time]=getdate()', {})
        .then((value: sql.IResult<any>) => {
            let recordsets = value.recordsets;
            let time: Date = recordsets[0][0]['time'];
            return time.getTime();
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
    registerNewJob(user: IGridUser, jobSubmit:IGridJobSubmit) : Promise<IJobProgress> {
        let sql = "exec [dbo].[stp_NodeJSGridSubmitJob]";
        sql += " @userId='" + GridDB.sqlEscapeString(user.userId) + "'";
        sql += ",@userName='" + GridDB.sqlEscapeString(user.displayName.toString()) + "'";
        sql += ",@priority=" + GridDB.sqlEscapeString(user.profile.priority.toString());
        let xml = GridDB.makeJobXML(jobSubmit);
        sql += ",@jobXML='" + GridDB.sqlEscapeString(xml) + "'";
        return this.query(sql, {})
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            let ret = recordsets[0][0];
            if (ret.err != 0)
                return Promise.reject(ret.error);
            else
                return Promise.resolve<IJobProgress>(recordsets[1][0]);
        });
    }
    reSubmitJob(user: IGridUser, oldJobId: string, failedTasksOnly: boolean) : Promise<IJobProgress> {
        let params = {
            'userId': user.userId
            ,'userName': user.displayName
            ,'priority': user.profile.priority
            ,'oldJobId': oldJobId
            ,'failedTasksOnly': failedTasksOnly
        };
        return this.execute('[dbo].[stp_NodeJSGridReSubmitJob]', params)
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            let ret = recordsets[0][0];
            if (ret.err != 0)
                return Promise.reject(ret.error);
            else
                return Promise.resolve<IJobProgress>(recordsets[1][0]);      
        });
    }
    getJobProgress(jobId:string) : Promise<IJobProgress> {
        return this.query('select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)', {'jobId': jobId})
        .then((value: sql.IResult<any>) => {
            let recordsets = value.recordsets;
            let dt = recordsets[0];
            if (dt.length === 0)
                return Promise.reject(errors.bad_job_id);
            else
                return Promise.resolve<IJobProgress>(dt[0]);
        });
    }
    getMultiJobsProgress(jobIds:string[]) : Promise<IJobProgress[]> {
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
        return this.query('select * from [dbo].[fnc_NodeJSGridMultiJobsProgress](@xml)', {'xml': xml})
        .then((value: sql.IResult<any>) => {
            let recordsets = value.recordsets;
            return Promise.resolve<IJobProgress[]>(recordsets[0]);
        });
    }
    getJobInfo(jobId:string) : Promise<IJobInfo> {
        return this.query('select * from [dbo].[fnc_NodeJSGridGetJobInfo](@jobId)', {'jobId': jobId})
        .then((value: sql.IResult<any>) => {
            let recordsets = value.recordsets;
            let dt = recordsets[0];
            if (dt.length === 0)
                return Promise.reject(errors.bad_job_id);
            else
                return Promise.resolve<IJobInfo>(dt[0]);
        });
    }
    getJobResult(jobId:string) : Promise<IJobResult> {
        return this.execute('[dbo].[stp_NodeJSGetJobResult]', {'jobId': jobId})
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            let dt = recordsets[0];
            if (dt.length === 0)
                return Promise.reject(errors.bad_job_id);
            else
                return Promise.resolve<IJobResult>(dt);
        });
    }
    killJob(jobId:string, markJobAborted: boolean) :  Promise<JobKillStatus> {
        let params = {
            'jobId': jobId
            ,'markJobAborted': markJobAborted
        };
        return this.execute('[dbo].[stp_NodeJSKillJob]', params)
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
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
                return Promise.reject(errors.bad_job_id);
            else
                return Promise.resolve<JobKillStatus>({runningProcess, jobProgress: dt[0]});
        });
    }
    getMostRecentJobs() : Promise<IJobInfo[]> {
        return this.execute('[dbo].[stp_NodeJSGetMostRecentJobs]', {})
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            return Promise.resolve<IJobInfo[]>(recordsets[0]);
        });
    }
    getTaskResult(task: ITask) : Promise<ITaskResult> {
        let params = {
            'jobId': task.j
            ,'taskIndex': task.t
        };
        return this.execute('[dbo].[stp_NodeJSGridGetTaskResult]', params)
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            let ret = recordsets[0][0];
            if (!ret)
                return Promise.reject(errors.bad_task_index);
            else
                return Promise.resolve<ITaskResult>(ret);
        });
    }

    getTaskExecParams(task:ITask, nodeId: string, nodeName: string) : Promise<ITaskExecParams> {
        let params = {
            'jobId': task.j
            ,'taskIndex': task.t
            ,'nodeId': nodeId
            ,'nodeName': nodeName
        };       
        return this.execute('[dbo].[stp_NodeJSGridJobTask]', params)
        .then((value: sql.IProcedureResult<any>) => {
            let recordsets = value.recordsets;
            let ret = recordsets[0][0];
            return Promise.resolve<ITaskExecParams>(ret);
        });
    }
    markTaskStart(task:ITask, pid:number) : Promise<void> {
        return this.execute('[dbo].[stp_NodeJSGridJobTask]', {'jobId': task.j, 'taskIndex': task.t, 'pid': pid}).then((value: sql.IProcedureResult<any>) => {});
    }
    markTaskEnd(task:ITask, result: ITaskExecResult) : Promise<void> {
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
        return this.query(sql, {}).then((value: sql.IResult<any>) => {});
    }
}

export function getServerGridDB(sqlConfig: sql.config, options?:sql.Options) : IServerGridDB {return new GridDB(sqlConfig, options);}
export function getTaskLauncherGridDB(sqlConfig: sql.config, options?:sql.Options) : ITaskLauncherGridDB {return new GridDB(sqlConfig, options);}  