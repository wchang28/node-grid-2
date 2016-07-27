import * as oauth2 from 'oauth2';

export interface IAuthorizedUser {
    userId: string;
    userName: string;
    displayName: string;
    email: string;
}

export interface IAccessTokenVerifier {
    verify: (accessToken: oauth2.AccessToken, done:(err: any, user: IAuthorizedUser) => void) => void;
}