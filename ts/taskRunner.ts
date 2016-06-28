import * as events from 'events';
import {ITaskExecParams, ITaskExecResult} from './messaging';

export class TaskRunner extends events.EventEmitter {
    constructor(private taskExecParams: ITaskExecParams) {
        super();
    }
    run(): void {
        let pid = 3567;
        this.emit('started', pid);
        setTimeout(() => {
            let result: ITaskExecResult = {
                pid: pid
                ,retCode: 0
                ,stdout: this.taskExecParams.cmd
                ,stderr: 'No error'
            };
            this.emit('finished', result);
        }, 5000);
    }
}