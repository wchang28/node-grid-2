export interface AccessToken {
    token_type: string;
    access_token: string;
}

export interface Access extends AccessToken {
    refresh_token?: string;
    instance_url?: string;
}