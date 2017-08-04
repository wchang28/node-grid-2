import * as events from 'events';
import {IGridUserProfile, IGridUser, IGridJobSubmit, IJobProgress, IJobInfo, IJobResult, ITask, INodeRunningProcess, IRunningProcessByNode, ITaskExecParams, ITaskExecResult, ITaskResult} from 'grid-client-core';
import {SimpleMSSQL, Configuration, Options} from 'mssql-simple';
import {DOMParser, XMLSerializer} from 'xmldom';
export {Configuration as SQLConfiguration, Options as DBOptions} from 'mssql-simple';
import * as errors from './errors';
import {IDsipatcherGridDB, JobKillStatus} from "./dispatcher";
import {ITaskLauncherGridDBImpl} from "./launcherApp";

export interface ISimpleMSSQL {
    connect() : void;
    disconnect(): void;
    on(event: "connected", listener: () => void) : this;
    on(event: "error", listener: (err: any) => void) : this;
    on(event: "disconnected", listener: () => void) : this;   
}

export interface IServerGridDBImpl extends IDsipatcherGridDB {
    getUserProfile(userId: string) : Promise<IGridUserProfile>;
    getTime() : Promise<number>;
}

export interface IServerGridDB extends IServerGridDBImpl, ISimpleMSSQL {}
export interface ITaskLauncherGridDB extends ITaskLauncherGridDBImpl, ISimpleMSSQL {}

// will emit the following events
// 1. connected
// 2. error
// 3. disconnected
class GridDB extends SimpleMSSQL implements IServerGridDBImpl, ITaskLauncherGridDBImpl, ISimpleMSSQL {
    constructor(sqlConfig: Configuration, options?:Options) {
        super(sqlConfig, options);
    }
    private static sqlEscapeString(str:string) {return str.replace(new RegExp("'", "gi"), "''");}

    getUserProfile(userId: string) : Promise<IGridUserProfile> {
        return new Promise<IGridUserProfile>((resolve: (value: IGridUserProfile) => void, reject: (err: any) => void)=> {
            this.execute('[dbo].[stp_NodeJSGridGetUserProfile]', {userId}, (err:any, recordsets:any[][]) => {
                if (err)
                    reject(err);
                else {
                    let dt = recordsets[0];
                    if (dt.length === 0)
                        reject(errors.bad_user_profile);
                    else
                        resolve(dt[0]);
                }
            });
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
    registerNewJob(user: IGridUser, jobSubmit:IGridJobSubmit) : Promise<IJobProgress> {
        return new Promise<IJobProgress>((resolve: (value: IJobProgress) => void, reject: (err: any) => void) => {
            let sql = "exec [dbo].[stp_NodeJSGridSubmitJob]";
            sql += " @userId='" + GridDB.sqlEscapeString(user.userId) + "'";
            sql += ",@userName='" + GridDB.sqlEscapeString(user.displayName.toString()) + "'";
            sql += ",@priority=" + GridDB.sqlEscapeString(user.profile.priority.toString());
            let xml = GridDB.makeJobXML(jobSubmit);
            sql += ",@jobXML='" + GridDB.sqlEscapeString(xml) + "'";
            this.query(sql, {}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let ret = recordsets[0][0];
                    if (ret.err != 0)
                        reject(ret.error);
                    else
                        resolve(recordsets[1][0]);
                }
            });
        });
    }
    reSubmitJob(user: IGridUser, oldJobId: string, failedTasksOnly: boolean) : Promise<IJobProgress> {
        return new Promise<IJobProgress>((resolve: (value: IJobProgress) => void, reject: (err: any) => void) => {
            let params = {
                'userId': user.userId
                ,'userName': user.displayName
                ,'priority': user.profile.priority
                ,'oldJobId': oldJobId
                ,'failedTasksOnly': failedTasksOnly
            };
            this.execute('[dbo].[stp_NodeJSGridReSubmitJob]', params, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let ret = recordsets[0][0];
                    if (ret.err != 0)
                        reject(ret.error);
                    else
                        resolve(recordsets[1][0]);
                }
            });
        });
    }
    getJobProgress(jobId:string) : Promise<IJobProgress> {
        return new Promise<IJobProgress>((resolve: (value: IJobProgress) => void, reject: (err: any) => void) => {
            this.query('select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)', {'jobId': jobId}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let dt = recordsets[0];
                    if (dt.length === 0)
                        reject(errors.bad_job_id);
                    else
                        resolve(dt[0]);
                }
            });
        });
    }
    getMultiJobsProgress(jobIds:string[]) : Promise<IJobProgress[]> {
        return new Promise<IJobProgress[]>((resolve: (value: IJobProgress[]) => void, reject: (err: any) => void) => {
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
            this.query('select * from [dbo].[fnc_NodeJSGridMultiJobsProgress](@xml)', {'xml': xml}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else
                    resolve(recordsets[0]);
            });
        });
    }
    getJobInfo(jobId:string) : Promise<IJobInfo> {
        return new Promise<IJobInfo>((resolve: (value: IJobInfo) => void, reject: (err: any) => void) => {
            this.query('select * from [dbo].[fnc_NodeJSGridGetJobInfo](@jobId)', {'jobId': jobId}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let dt = recordsets[0];
                    if (dt.length === 0)
                        reject(errors.bad_job_id);
                    else
                        resolve(dt[0]);
                }
            });
        });
    }
    getJobResult(jobId:string) : Promise<IJobResult> {
        return new Promise<IJobResult>((resolve: (value: IJobResult) => void, reject: (err: any) => void) => {
            this.execute('[dbo].[stp_NodeJSGetJobResult]', {'jobId': jobId}, (err: any, recordsets: any) : void => {
                if (err)
                    reject(err);
                else {
                    let dt = recordsets[0];
                    if (dt.length === 0)
                        reject(errors.bad_job_id);
                    else
                        resolve(dt);
                }
            });
        });
    }
    killJob(jobId:string, markJobAborted: boolean) :  Promise<JobKillStatus> {
        return new Promise<JobKillStatus>((resolve: (value: JobKillStatus) => void, reject: (err: any) => void) => {
            let params = {
                'jobId': jobId
                ,'markJobAborted': markJobAborted
            };
            this.execute('[dbo].[stp_NodeJSKillJob]', params, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
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
                        reject(errors.bad_job_id);
                    else
                        resolve({runningProcess, jobProgress: dt[0]});
                }
            });
        });
    }
    getMostRecentJobs() : Promise<IJobInfo[]> {
        return new Promise<IJobInfo[]>((resolve: (value: IJobInfo[]) => void, reject: (err: any) => void) => {
            this.execute('[dbo].[stp_NodeJSGetMostRecentJobs]', {}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else
                    reject(recordsets[0]);
            });
        });
    }
    getTaskResult(task: ITask) : Promise<ITaskResult> {
        return new Promise<ITaskResult>((resolve: (value: ITaskResult) => void, reject: (err: any) => void) => {
            let params = {
                'jobId': task.j
                ,'taskIndex': task.t
            };
            this.execute('[dbo].[stp_NodeJSGridGetTaskResult]', params, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let ret = recordsets[0][0];
                    if (!ret)
                        reject(errors.bad_task_index);
                    else
                        resolve(ret);
                }
            });
        });
    }

    getTaskExecParams(task:ITask, nodeId: string, nodeName: string) : Promise<ITaskExecParams> {
        return new Promise<ITaskExecParams>((resolve: (value: ITaskExecParams) => void, reject: (err: any) => void) => {
            let params = {
                'jobId': task.j
                ,'taskIndex': task.t
                ,'nodeId': nodeId
                ,'nodeName': nodeName
            };       
            this.execute('[dbo].[stp_NodeJSGridJobTask]', params, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else {
                    let ret = recordsets[0][0];
                    resolve(ret);
                }
            });
        });
    }
    markTaskStart(task:ITask, pid:number) : Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
            this.execute('[dbo].[stp_NodeJSGridJobTask]', {'jobId': task.j, 'taskIndex': task.t, 'pid': pid}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    markTaskEnd(task:ITask, result: ITaskExecResult) : Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
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
            this.query(sql, {}, (err: any, recordsets: any[][]) : void => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
}

export function getServerGridDB(sqlConfig: Configuration, options?:Options) : IServerGridDB {return new GridDB(sqlConfig, options);}
export function getTaskLauncherGridDB(sqlConfig: Configuration, options?:Options) : ITaskLauncherGridDB {return new GridDB(sqlConfig, options);}  