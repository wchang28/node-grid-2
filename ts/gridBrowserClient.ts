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

export {jQuery} from 'rest-browser';

export {Utils} from  './utils';
export {ISession} from './gridClient';
export * from './messaging';
export {IMessageClient, IMessage} from 'rcf';