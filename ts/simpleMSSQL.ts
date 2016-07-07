import * as sql from 'mssql';
import * as events from 'events';

export interface QueryCallback {
    (err: any, recordsets: any): void;
}

// will emit the following events
// 1. connected
// 2. error
// 3. disconnected
export class SimpleMSSQL extends events.EventEmitter {
    private __connection: sql.Connection = null;
    private static NOT_CONNECTED: string = 'not connected to the database';
    constructor(private __sqlConfig: sql.Configuration, private __reconnectIntervalMS: number = 5000) {
        super();
    }
    private onConnectionError(err) : void {
        try {this.__connection.close();} catch(e) {}
        this.__connection = null;
        setTimeout(() => {
            this.connect();
        }, this.__reconnectIntervalMS);
        this.emit('error', err);
    }
    connect() : void {
        if (!this.__connection) {
            this.__connection = new sql.Connection(this.__sqlConfig, (err:any) => {
                if (err)
                    this.onConnectionError(err);
                else
                    this.emit('connected');
            });
		    this.__connection.on('error', (err) => {
                this.onConnectionError(err);
		    });          
        }
    }
    disconnect() : void {
        if (this.__connection) {
            try {this.__connection.close();} catch(e) {}
            this.__connection = null;
            this.emit('disconnected');
        }
    }

    query(sqlString:string, params: any, done: QueryCallback) : void {
        if (!this.__connection) {
            done(SimpleMSSQL.NOT_CONNECTED, null);
            return;
        }
        let request = new sql.Request(this.__connection);
        request.multiple = true;
        if (params) {
            for (let field in params)
                request.input(field, params[field]);
        }
        request.query(sqlString, done);
    }

    execute(storedProc:string, params: any, done: QueryCallback) : void {
        if (!this.__connection) {
            done(SimpleMSSQL.NOT_CONNECTED, null);
            return;
        }
        let request = new sql.Request(this.__connection);
        if (params) {
            for (let field in params)
                request.input(field, params[field]);
        }
        request.execute(storedProc, done);
    }
}

export {Configuration} from 'mssql';