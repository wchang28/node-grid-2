import {SQLConfiguration, IGridDBOptions} from './gridDB';

export interface IGridDBConfiguration {
    sqlConfig: SQLConfiguration
    dbOptions?: IGridDBOptions
}