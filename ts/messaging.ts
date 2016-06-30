export interface GridMessage {
    type: string
    content: any
}

export interface IUser {
    userId: string;
    priority: number;
}

export interface INode {
    id: string;
    name: string;
}

export interface INodeReady {
    numCPUs: number;
    name?: string;
}

export interface ITask {
    j: number;
    t: number;
}

export interface IJobProgress {
    jobId: number;
    userId: string;
    status: string;
    numTasks: number;
    numTasksFinished: number;
    success: boolean;
}

export interface IJobTrackItem {
    jp: IJobProgress;
    ncks: string[];
}

export interface INodeRunningProcess {
    nodeId: string;
    pid: number;
}

export interface IRunningProcessByNode {
    [nodeId: string]: number[]
}

export interface ITaskExecParams {
    cmd: string;
    stdin: string;
}

export interface ITaskExecResult {
    pid: number;
    retCode: number;
    stdout: string;
    stderr: string;
}