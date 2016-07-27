import {IAccessTokenVerifier, IAuthorizedUser} from './accessTokenVerifier';
import * as oauth2 from 'oauth2';
import {getAJaxon, IAjaxon} from 'ajaxon';

export interface TokenVerifierOptions {
    url:string;
    rejectUnauthorized?: boolean;
}

export interface ITokenVerifyParams {
	clientAppSettings: oauth2.ClientAppSettings;
	accessToken: oauth2.AccessToken;
}

export class TokenVerifier implements IAccessTokenVerifier {
    private $J: IAjaxon = null;
    constructor(jQuery:any, public options: TokenVerifierOptions, public clientAppSettings: oauth2.ClientAppSettings) {
        this.$J = getAJaxon(jQuery);
    }
    verify(accessToken: oauth2.AccessToken, done:(err:any, user: IAuthorizedUser) => void) : void {
        let params: ITokenVerifyParams = {
            clientAppSettings: this.clientAppSettings
            ,accessToken: accessToken
        };
        this.$J('POST', this.options.url, params, done, null, this.options.rejectUnauthorized);
    }
}