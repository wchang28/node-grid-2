export interface GridMessage {
    type: string
    content: any
}

export interface IGridUserProfile {
    canSubmitJob: boolean;
    canKillOtherUsersJob: boolean;
    canStartStopDispatching: boolean;
    canOpenCloseQueue: boolean;
    canEnableDisableNode: boolean;
}

export interface IGridUser {
    userId: string;
    priority: number;
    profile: IGridUserProfile;
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
    j: string;
    t: number;
}

export interface IJobProgress {
    jobId: string;
    status: string;
    numTasks: number;
    numTasksFinished: number; 
    success: boolean;
}

export interface IJobInfo extends IJobProgress {
    description: string;
    cookie: string;
    userId: string;
    priority: number;
    submitTime: Date;
    startTime: Date;
    finishTime: Date;
    durationSeconds: number;
    completePct: number;
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