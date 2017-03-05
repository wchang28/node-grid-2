import * as $browser from 'rest-browser';
import {ISession, SessionBase} from 'grid-client-core';

class GridSession extends SessionBase implements ISession {
    constructor() {
        super($browser.get({EventSource: global['EventSource']}), null, null);
    }
    logout() : Promise<any> {
        return new Promise<any>((resolve: (value: any) => void, reject: (err: any) => void) => {
            let path = "/logout";
            window.location.href = path;
            resolve({});
        });
    }
}

export class GridClient {
    static getSession() : ISession {
        return new GridSession();
    }
}

export * from 'grid-client-core';