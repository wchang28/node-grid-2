import * as oauth2 from 'oauth2';
export {IError} from 'oauth2';

let err_not_authorized = oauth2.errors.not_authorized;
let err_bad_node_id: oauth2.IError = {error: 'bad_node_id', error_description: 'invalid node id'};
let err_invalid_node: oauth2.IError = {error: 'invalid_node', error_description: 'not a valid node'};
let err_bad_job_id: oauth2.IError = {error: 'bad_job_id', error_description: 'invalid job id'};
let err_bad_user_profile: oauth2.IError = {error: 'bad_user_profile', error_description: 'invalid user profile'};
let err_no_task_for_job: oauth2.IError = {error: 'bad_job_submit', error_description: 'no task for job'};
let err_bad_task_cmd: oauth2.IError = {error: 'bad_job_submit', error_description: 'cmd not optional for task'};
let err_bad_task_index: oauth2.IError = {error: 'bad_task_index', error_description: 'invalid task index'};

export {err_not_authorized as not_authorized};
export {err_bad_node_id as bad_node_id};
export {err_invalid_node as invalid_node};
export {err_bad_job_id as bad_job_id};
export {err_bad_user_profile as bad_user_profile};
export {err_no_task_for_job as no_task_for_job};
export {err_bad_task_cmd as bad_task_cmd};
export {err_bad_task_index as bad_task_index};