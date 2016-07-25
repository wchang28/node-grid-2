import {SQLConfiguration, DBOptions} from './gridDB';

export interface IGridDBConfiguration {
    sqlConfig: SQLConfiguration
    dbOptions?: DBOptions
}