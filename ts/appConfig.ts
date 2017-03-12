import {IWebServerConfig} from 'express-web-server';
import {IAuthorizeEndpointOptions} from 'polaris-auth-client';
import {IGridDBConfiguration} from './gridDBConfig';
import {IDispatcherConfig} from './dispatcher';
import {IAutoScalerConfig} from './autoScalerConfig';

export interface IAppConfig {
    nodeWebServerConfig: IWebServerConfig;
    clientWebServerConfig: IWebServerConfig;
    authorizeEndpointOptions: IAuthorizeEndpointOptions;
    dbConfig: IGridDBConfiguration;
    dispatcherConfig?: IDispatcherConfig;
    autoScalerConfig?: IAutoScalerConfig;
}