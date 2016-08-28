import * as fs from 'fs';
import * as path from 'path';
import {IGridClientConfig, GridClient, ISession} from 'grid-client-node';
import {run as runSomeTestJob} from './runSomeTestJob';

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

let client = new GridClient(config);

client.login(username, password, (err:any, session: ISession) => {
    if (err) {
        console.error('!!! Login error: ' + JSON.stringify(err));
        process.exit(1);
    } else {
        runSomeTestJob(session, (error:any) => {
            session.logout((err:any) => {
                process.exit(error ? 1 : 0);
            });
        });
    }
});