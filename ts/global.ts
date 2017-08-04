
import {Dispatcher} from "./dispatcher";
import {IServerGridDB} from "./gridDB";
import {GridAutoScaler} from 'grid-autoscaler';

export interface IGlobal {
    dispatcher: Dispatcher;
    gridDB: IServerGridDB;
    gridAutoScaler?: GridAutoScaler;
}