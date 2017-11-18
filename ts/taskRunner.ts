import * as events from 'events';
import * as fs from 'fs';
import * as stream from 'stream';
import {exec} from 'child_process';
import treeKill = require('tree-kill');
import {ITaskExecParams, ITaskExecResult} from 'grid-client-core';

export interface ITaskRunner {
    run(): void;
    on(event: "started", listener: (pid: number) => void) : this;
    on(event: "finished", listener: (result: ITaskExecResult) => void) : this;
}

class TaskRunner extends events.EventEmitter implements ITaskRunner {
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
        let raisedError = "";
        if (stdin && stdin.length > 0) {
            if (stdin.length >= 1 && stdin.substr(0,1) === '@') {   // stdin string begins with '@' => a file path
                let stdinFile = stdin.substr(1);
                instream = fs.createReadStream(stdinFile, {encoding: 'utf8'});
            } else {
                instream = new stream.Readable();
                instream.setEncoding("utf8");
                instream.push(stdin);
                instream.push(null);
            }
        }
        if (instream) {
            instream.on("error", (err: any) => {    // stdin stream has some kind of error (maybe input file does not exist)
                if (err.syscall && err.path)
                    raisedError = "error " + err.syscall + " " + err.path;
                else
                    raisedError = JSON.stringify(err);
                treeKill(pid, 'SIGKILL');   // kill the child process tree
            });
        }
        let env: any;
        if (this.taskExecParams.envJSON) {
            try {env = JSON.parse(this.taskExecParams.envJSON);}catch(e) {}
        }
        let child = exec(cmd, {maxBuffer: 20000 * 1024, env});
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
        child.on('close', (code: number, signal: string) => {
            let result: ITaskExecResult = {
                pid
                ,retCode: code
                ,stdout: (stdout.length > 0 ? stdout : null)
                ,stderr: (stderr.length > 0 ? stderr : (raisedError ? raisedError : null))
            };
            this.emit('finished', result);
        });
    }
}

export function runner(taskExecParams: ITaskExecParams) : ITaskRunner { return new TaskRunner(taskExecParams); } 