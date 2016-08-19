import * as fs from 'fs';
import * as path from 'path';
import {IGridClientConfig, IGridJobSubmit, GridClient, ISession, IJobProgress, IJobResult, ITaskItem} from '../gridNodeClient';
import {TestJobs} from './testJobs';

let username = process.argv[2];
if (!username) {
    console.error('!!! musr enter username');
    process.exit(1);
}
let password = process.argv[3];
if (!password) {
    console.error('!!! musr enter password');
    process.exit(1);
}

let configFile = (process.argv.length < 5 ? path.join(__dirname, '../../client_testing_config.json') : process.argv[4]);
let config: IGridClientConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let js = TestJobs.getEchoTestJob(1000);
//let js = TestJobs.getSleepTestJob();

let client = new GridClient(config);

client.login(username, password, (err:any, session: ISession) => {
    if (err) {
        console.error('!!! Login error: ' + JSON.stringify(err));
        process.exit(1);
    } else {
        let job = session.runJob(js);
        //let job = session.reRunJob('24', true)
        job.on('submitted', (jobId: string) => {
            console.log('job submitted, joId=' + jobId);
        }).on('status-changed', (jp: IJobProgress) => {
            console.log(JSON.stringify(jp));
        }).on('error', (err:any) => {
            console.error('!!! Error: ' + JSON.stringify(err));
            session.logout((err:any) => {
                process.exit(1);
            });
        }).on('done', (jp: IJobProgress) => {
            console.log('job ' + job.jobId + ' finished with status = ' + jp.status);
            session.getJobResult(job.jobId, (err:any,jobResult:IJobResult) => {
                if (err)
                    console.error('!!! Error: ' + JSON.stringify(err));
                else {
                    console.log('============================================================');
                    //console.log(JSON.stringify(jobResult));
                    console.log('============================================================');
                }
                session.logout((err:any) => {
                    process.exit(0);
                });
            });
        });
        job.run();
    }
});