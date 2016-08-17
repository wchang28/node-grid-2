import * as $node from 'rest-node';
import {ISession, SessionBase} from './gridClient';
import * as oauth2 from 'oauth2';
import {TokenGrant as OAuth2TokenGrant} from 'oauth2-token-grant';

class GridSession extends SessionBase implements ISession {
    constructor(access: oauth2.Access, tokenGrant: oauth2.ITokenGrant) {
        super($node.get(), access, tokenGrant);
    }
    logout(done?:(err:any) => void) : void {
        let path = "/logout";
        this.$J("GET", path, {}, (typeof done=== 'function' ? done : (err:any, ret: any) => {}));
    }
}

export interface IGridClientConfig {
    oauth2Options: oauth2.ClientAppOptions;
}

export class GridClient {
    private tokenGrant: oauth2.ITokenGrant = null;
    constructor(private __config: IGridClientConfig) {
        this.tokenGrant = new OAuth2TokenGrant(__config.oauth2Options.tokenGrantOptions, __config.oauth2Options.clientAppSettings);
    }
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        this.tokenGrant.getAccessTokenFromPassword(username, password, (err, access: oauth2.Access) => {
            if (err) {
                done(err, null);
            } else {
                let session = new GridSession(access, this.tokenGrant);
                done(null, session);
            }
        });
    }
}

export {Utils} from  './utils';
export {ISession} from './gridClient';
export * from './messaging';
export {IMessageClient, IMessage} from 'rcf';