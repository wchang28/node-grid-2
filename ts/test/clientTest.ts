import * as gc from '../gridClient';

let config:IGridClientConfig = {

};

let js:gc.IGridJobSubmit = {
    description: 'this is a test'
    ,cookie: 'test'
    ,tasks: []
};

for (let i:number = 0; i < 100; i++) {
    let task: gc.ITaskItem  = {
        cmd: 'echo Hi from Wen'
        ,cookie: i.toString()
    }
    js.tasks.push(task);
}

let client = new gc.GridClient(config);
client.login('','', (err:any, session:gc.ISession) => {
    let job = session.runJob(js);
    job.on('submitted', (jobId:string) => {
        console.log('job summitted, joId=' + jobId);
    }).on('status-changed', (jp:gc.IJobProgress) => {
        console.log(JSON.stringify(jp));
    }).on('error', (err:any) => {
        console.log('!!! Error: ' + JSON.stringify(err));
    }).on('done', (jp:gc.IJobProgress) => {
        console.log('job ' + job.jobId + ' finished with status = ' + jp.status);
        session.logout();
        process.exit(0);
    });
    job.run();
});