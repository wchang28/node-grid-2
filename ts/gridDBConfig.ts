import {config, Options} from './gridDB';

export interface IGridDBConfiguration {
    sqlConfig: config;
    dbOptions?: Options;
}