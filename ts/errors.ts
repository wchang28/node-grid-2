import * as oauth2 from 'oauth2';
export {IError} from 'oauth2';

let err_not_authorized = oauth2.errors.not_authorized;
let err_bad_node_id: oauth2.IError = {error: 'bad_node_id', error_description: 'invalid node id'};
let err_invalid_node: oauth2.IError = {error: 'invalid_node', error_description: 'not a valid node'};
let err_bad_job_id: oauth2.IError = {error: 'bad_job_id', error_description: 'invalid job id'};

export {err_not_authorized as not_authorized};
export {err_bad_node_id as bad_node_id};
export {err_invalid_node as invalid_node};
export {err_bad_job_id as bad_job_id};