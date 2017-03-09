
import {Dispatcher} from "./dispatcher";
import {GridDB} from "./gridDB";

export interface IGlobal {
    dispatcher: Dispatcher;
    gridDB: GridDB;
}