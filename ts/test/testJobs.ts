import {IGridJobSubmit, ITaskItem} from '../messaging';

export class TestJobs {
    static getEchoTestJob(numTasks:number) : IGridJobSubmit {
        let js:IGridJobSubmit = {
            description: 'this is an echo test'
            ,cookie: numTasks.toString() + ' echo(s) test'
            ,tasks: []
        };
        for (let i = 0; i < numTasks; i++) {
            let task: ITaskItem  = {
                cmd: "echo Hi everybody from 'John Doe'"
                ,cookie: (i+1).toString()
            }
            js.tasks.push(task);
        }
        return js;
    }
    static getSleepTestJob() : IGridJobSubmit {
        let js:IGridJobSubmit = {
            description: 'this is a sleep test'
            ,cookie: 'sleep test'
            ,tasks: []
        };
        for (let i = 0; i < 15; i++) {
            let task: ITaskItem  = {
                cmd: 'sleep 10'
                ,cookie: (i+1).toString()
            }
            js.tasks.push(task);
        }
        return js;
    }
}