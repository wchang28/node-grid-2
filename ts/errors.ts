export interface IError {
    error: any;
    error_description?: string;
}

let err_not_authorized: IError = {error: 'not_authorized', error_description: 'not authorized'};
let err_bad_node_id: IError = {error: 'bad_node_id', error_description: 'invalid node id'};
let err_invalid_node: IError = {error: 'invalid_node', error_description: 'not a valid node'};
let err_bad_job_id: IError = {error: 'bad_job_id', error_description: 'invalid job id'};

export {err_not_authorized as not_authorized};
export {err_bad_node_id as bad_node_id};
export {err_invalid_node as invalid_node};
export {err_bad_job_id as bad_job_id};