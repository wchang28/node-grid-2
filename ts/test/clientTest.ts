import {IGridClientConfig, IGridJobSubmit, GridClient, ISession, IJobProgress, ITaskItem} from '../gridClient';

let config: IGridClientConfig = {
    oauth2Config: {
        tokenGrantUrl: ''
        ,rejectUnauthorized: false
    }
    ,dispatcherConfig: {
        url: 'http://127.0.0.1:26355'
        ,rejectUnauthorized: false        
    }
};

let username = '';
let password = '';

let js:IGridJobSubmit = {
    description: 'this is a test'
    ,cookie: 'test'
    ,tasks: []
};

for (let i:number = 0; i < 100; i++) {
    let task: ITaskItem  = {
        cmd: 'echo Hi from Wen'
        ,cookie: i.toString()
    }
    js.tasks.push(task);
}

let client = new GridClient(config);
client.login(username, password, (err:any, session: ISession) => {
    let job = session.runJob(js);
    job.on('submitted', (jobId: string) => {
        console.log('job summitted, joId=' + jobId);
    }).on('status-changed', (jp: IJobProgress) => {
        console.log(JSON.stringify(jp));
    }).on('error', (err:any) => {
        console.log('!!! Error: ' + JSON.stringify(err));
    }).on('done', (jp: IJobProgress) => {
        console.log('job ' + job.jobId + ' finished with status = ' + jp.status);
        session.logout();
        process.exit(0);
    });
    job.run();
});