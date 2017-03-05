import {ISession, IJobProgress, ITask, ITaskResult, IJobResult} from 'grid-client-core';
import {TestJobs} from './testJobs';

export function run(session: ISession) : Promise<any> {
    return new Promise<any>((resolve: (value: any) => void, reject: (err: any) => void) => {
        let js = TestJobs.getEchoTestJob(100);
        //let js = TestJobs.getSleepTestJob();

        let job = session.runJob(js);
        job.on('submitted', (jobId: string) => {
            console.log('job submitted, joId=' + jobId);
        }).on('status-changed', (jp: IJobProgress) => {
            console.log(JSON.stringify(jp));
        }).on('task-complete', (task:ITask) => {
            console.log('task completed => ' + JSON.stringify(task));
            session.getTaskResult(task.j, task.t)
            .then((taskResult:ITaskResult) => {
                console.log(JSON.stringify(taskResult, null, 2));
            }).catch((err: any) => {
                console.log("!!! Error getting task result for task " + JSON.stringify(task) + ": " + JSON.stringify(err));
            });
        }).on('error', (error:any) => {
            console.error('!!! Error: ' + JSON.stringify(error));
            reject(error);
        }).on('done', (jp: IJobProgress) => {
            console.log('job ' + job.jobId + ' finished with status = ' + jp.status);
            session.getJobResult(job.jobId)
            .then((jobResult:IJobResult) => {
                console.log('============================================================');
                //console.log(JSON.stringify(jobResult));
                console.log('============================================================');
                resolve({});
            }).catch((error: any) => {
                console.error('!!! Error: ' + JSON.stringify(error));
                reject(error);
            });
        });
        job.run();
    });
}