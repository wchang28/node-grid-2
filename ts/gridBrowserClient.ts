import * as $browser from 'rest-browser';
import {ISession, SessionBase} from './gridClient';

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

export {Utils} from  './utils';
export {ISession, MessageCallback, IMessageClient} from './gridClient';
export * from './messaging';