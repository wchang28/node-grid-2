import * as events from 'events';
import * as fs from 'fs';
import * as stream from 'stream';
import {exec} from 'child_process';
import {ITaskExecParams, ITaskExecResult} from './messaging';

export class TaskRunner extends events.EventEmitter {
    constructor(private taskExecParams: ITaskExecParams) {
        super();
    }
    run(): void {
        let cmd = this.taskExecParams.cmd;
        let stdin = this.taskExecParams.stdin;
        let instream: stream.Readable = null;
        let pid:number = null;
        let stdout = '';
        let stderr = '';
        if (stdin && stdin.length > 0) {
            if (stdin.length >= 1 && stdin.substr(0,1) === '@') {
                let stdinFile = stdin.substr(1);
                try {
                    instream = fs.createReadStream(stdinFile, 'utf8');
                    if (!instream) throw '';
                } catch(e) {
                    let result: ITaskExecResult = {
                        pid: 0
                        ,retCode: 1
                        ,stdout: null
                        ,stderr: 'error opening stdin file ' + stdinFile
                    };
                    this.emit('finished', result);
                }
            } else {
                instream = new stream.Readable();
                instream.push(stdin);
                instream.push(null);
            }
        }
        let errorRaised = false;
        let child = exec(cmd, {});
        if (instream && child.stdin) instream.pipe(child.stdin);
        pid = child.pid;
        this.emit('started', pid);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (data:string) => {
            stdout += data;
        });
        child.stderr.on('data', (data:string) => {
            stderr += data;
        });
        child.on('error', (err: any) => {
            let result: ITaskExecResult = {
                pid: pid
                ,retCode: (err.code ? err.code : 1)
                ,stdout: (stdout.length > 0 ? stdout : null)
                ,stderr: (stderr.length > 0 ? stderr : null)
            };
            this.emit('finished', result);
            errorRaised = true;
        });
        child.on('close', (exitCode) => {
            if (!errorRaised) {
                let result: ITaskExecResult = {
                    pid: pid
                    ,retCode: exitCode
                    ,stdout: (stdout.length > 0 ? stdout : null)
                    ,stderr: (stderr.length > 0 ? stderr : null)
                };
                this.emit('finished', result);
            }
        });
    }
}