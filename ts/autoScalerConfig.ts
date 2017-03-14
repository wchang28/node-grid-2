import {Options as AutoScalerOptions} from 'grid-autoscaler';

export interface AutoScalerImplementationConfig {
    factoryPackagePath: string;
    options?: any;
}

export interface IAutoScalerConfig {
    autoScalerOptions?: AutoScalerOptions;
    implementationConfig: AutoScalerImplementationConfig;
}