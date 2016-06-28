import {IUser, IJobProgress, ITask, ITaskExecParams, ITaskExecResult} from './messaging';
import {SimpleMSSQL} from 'simple-mssql';

export class JobDB {
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
    getTaskExecParams(task:ITask, nodeName: string, done:(err:any, taskExecParams: ITaskExecParams) => void) : void {
        this.ssql.execute('[dbo].[stp_NodeJSGridJobTask]', {'jobId': task.j, 'taskIndex': task.t, 'node': nodeName}, (err: any, recordsets: any) : void => {
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
            ,'retCode': result.retCode
            ,'stdout': result.stdout
            ,'stderr': result.stderr
        };
        this.ssql.execute('[dbo].[stp_NodeJSGridJobTask]', params, (err: any, recordsets: any) : void => {
            done(err);
        });
    }
}