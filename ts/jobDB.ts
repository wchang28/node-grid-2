import {IUser, IRegisteredJob} from './messaging';
import {SimpleMSSQL} from 'simple-mssql';

export class JobDB {
    private ssql: SimpleMSSQL;
    constructor(sqlConfig:any) {
        this.ssql = new SimpleMSSQL(sqlConfig); 
    }
    registerNewJob(user: IUser, jobXML: string, done:(err:any, job: IRegisteredJob) => void) : void {
        this.ssql.execute('[dbo].[stp_NodeJSGridSubmitJob]', {'userId': user.userId, 'priority': user.priority, 'jobXML': jobXML}, (err: any, recordsets: any) : void => {
            if (err) {
                done(err, null);
            } else {
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
}