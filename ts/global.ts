
import {Dispatcher} from "./dispatcher";
import {GridDB} from "./gridDB";
import {GridAutoScaler} from 'grid-autoscaler';

export interface IGlobal {
    dispatcher: Dispatcher;
    gridDB: GridDB;
    gridAutoScaler?: GridAutoScaler;
}