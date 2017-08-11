import * as fs from 'fs';
import * as path from 'path';
import {IGridClientConfig, GridClient, ISession} from 'grid-client-node';
import {run as runSomeTestJob} from './runSomeTestJob';

let username = process.argv[2];
if (!username) {
    console.error('!!! must enter username');
    process.exit(1);
}
let password = process.argv[3];
if (!password) {
    console.error('!!! must enter password');
    process.exit(1);
}

let configFile = (process.argv.length < 5 ? path.join(__dirname, '../../config/client_testing_config.json') : process.argv[4]);
let config: IGridClientConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

let client = new GridClient(config);

client.login(username, password)
.then((session: ISession) => {
    runSomeTestJob(session)
    .then(() => {
        session.logout()
        .then(() => {
            process.exit(0);
        }).catch((err: any) => {
            process.exit(0);
        });
    }).catch((error: any) => {
        session.logout()
        .then(() => {
            process.exit(1);
        }).catch((err: any) => {
            process.exit(1);
        });
    });
}).catch((err: any) => {
    console.error('!!! Login error: ' + JSON.stringify(err));
    process.exit(1); 
});