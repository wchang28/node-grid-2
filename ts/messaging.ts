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

export interface IRegisteredJob {
    jobId: number;
    numTasks: number;
} 