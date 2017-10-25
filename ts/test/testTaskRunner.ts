import {runner} from "../taskRunner";

let cmd = process.argv[2];
if (!cmd) {
    console.error('!!! must specify a command');
    process.exit(1);
}

let stdin = process.argv[3];
if (!stdin) stdin = void 0;

let taskRunner = runner({cmd, stdin});

taskRunner.on("started", (pid: number) => {
    console.log(`<<started>>, pid={$pid}`);
}).on("finished", (result: any) => {
    console.log("<<finished>>, result=\n" + JSON.stringify(result, null, 2));
}).run();