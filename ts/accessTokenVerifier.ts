import * as oauth2 from 'oauth2';
import * as errors from './errors';

export interface IAuthorizedUser {
    userId: string;
    userName: string;
    displayName: string;
    email: string;
}

export interface IAccessTokenVerifier {
    verify: (accessToken: oauth2.AccessToken, done:(err: errors.IError, user: IAuthorizedUser) => void) => void;
}