import {IUser, IRegisteredJob} from './messaging';

export class JobDB {
    constructor(sqlConfig:any) {}
    registerNewJob(user: IUser, jobXML: string, done:(err:any, job: IRegisteredJob) => void) : void {

    }
}