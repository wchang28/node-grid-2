import * as $node from 'rest-node';
import {ISession, SessionBase, OAuth2Access, IOAuth2TokenGrant} from 'grid-client-core';
import * as oauth2 from 'oauth2';
import {TokenGrant as OAuth2TokenGrant} from 'oauth2-token-grant';

class GridSession extends SessionBase implements ISession {
    constructor(access: OAuth2Access, tokenGrant: IOAuth2TokenGrant) {
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
    private tokenGrant: IOAuth2TokenGrant = null;
    constructor(config: IGridClientConfig) {
        this.tokenGrant = new OAuth2TokenGrant(config.oauth2Options.tokenGrantOptions, config.oauth2Options.clientAppSettings);
    }
    login(username: string, password: string, done:(err:any, session: ISession) => void) {
        this.tokenGrant.getAccessTokenFromPassword(username, password, (err, access: OAuth2Access) => {
            if (err) {
                done(err, null);
            } else {
                let session = new GridSession(access, this.tokenGrant);
                done(null, session);
            }
        });
    }
}

export * from 'grid-client-core';