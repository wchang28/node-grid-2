import {IUser, IJobProgress, ITask, INodeRunningProcess, IRunningProcessByNode, ITaskExecParams, ITaskExecResult} from './messaging';
import {SimpleMSSQL} from 'simple-mssql';

export class GridDB {
    private ssql: SimpleMSSQL;
    constructor(sqlConfig:any) {
        this.ssql = new SimpleMSSQL(sqlConfig); 
    }
    registerNewJob(user: IUser, jobXML: string, done:(err:any, jobProgress: IJobProgress) => void) : void {
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
    getJobProgress(jobId:number, done:(err:any, jobProgress: IJobProgress) => void) : void {
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
    killJob(jobId:number, markJobAborted: boolean, done:(err:any, runningProcess: IRunningProcessByNode, jobProgress: IJobProgress) => void) : void {
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