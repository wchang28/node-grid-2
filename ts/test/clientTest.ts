let $ = require('jquery-no-dom');
import {IGridClientConfig, IGridJobSubmit, GridClient, ISession, IJobProgress, ITaskItem} from '../gridClient';

let config: IGridClientConfig =
{
    "oauth2Options":
     {
        "tokenGrantOptions":
        {
            "url": 'http://127.0.0.1:3382/services/oauth2/token'
            ,"rejectUnauthorized": false
        }
        ,"clientAppSettings":
        {
            "client_id": "jfbgrbtgbirutbgibrgtbriwgh9045hgrobv"
            ,"client_secret": "598ty4ghh0u3ojfvnscUJYRUJfbgrsthrJFJ0J"
        }
    }
    ,"dispatcherConfig":
    {
        "baseUrl": "http://127.0.0.1:26355"
        ,"rejectUnauthorized": false
    }
};

let username = 'wchang';
let password = '954gowrtj04';

let js:IGridJobSubmit = {
    description: 'this is a test'
    ,cookie: 'test'
    ,tasks: []
};

for (let i = 0; i < 1000; i++) {
    let task: ITaskItem  = {
        cmd: 'echo Hi from Wen'
        ,cookie: (i+1).toString()
    }
    js.tasks.push(task);
}

/*
for (let i = 0; i < 15; i++) {
    let task: ITaskItem  = {
        cmd: 'sleep 15'
        ,cookie: (i+1).toString()
    }
    js.tasks.push(task);
}
*/

let client = new GridClient($, config);

client.login(username, password, (err:any, session: ISession) => {
    if (err) {
        console.error('!!! Login error: ' + JSON.stringify(err));
        process.exit(1);
    } else {
        let job = session.runJob(js);
        //let job = session.reRunJob('24', true)
        job.on('submitted', (jobId: string) => {
            console.log('job summitted, joId=' + jobId);
        }).on('status-changed', (jp: IJobProgress) => {
            console.log(JSON.stringify(jp));
        }).on('error', (err:any) => {
            console.error('!!! Error: ' + JSON.stringify(err));
            session.logout();
            process.exit(1);
        }).on('done', (jp: IJobProgress) => {
            console.log('job ' + job.jobId + ' finished with status = ' + jp.status);
            session.logout();
            process.exit(0);
        });
        job.run();
    }
});