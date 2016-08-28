import * as $browser from 'rest-browser';
import {ISession, SessionBase} from 'grid-client-core';

class GridSession extends SessionBase implements ISession {
    constructor() {
        super($browser.get({EventSource: global['EventSource']}), null, null);
    }
    logout(done?:(err:any) => void) : void {
        let path = "/logout";
        window.location.href = path;
    }
}

export class GridClient {
    static getSession() : ISession {
        return new GridSession();
    }
}

export * from 'grid-client-core';