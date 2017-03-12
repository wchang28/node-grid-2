import {Options as AutoScalerOptions} from 'grid-autoscaler';
import {IAutoScalerImplementation} from 'autoscalable-grid';

export type AutoScalerImplementationFactory = (options?: any) => IAutoScalerImplementation;
export interface AutoScalerImplementationPackageExport {
    factory: AutoScalerImplementationFactory
}
export interface AutoScalerImplementationConfig {
    factoryPackagePath: string;
    options?: any;
}

export interface IAutoScalerConfig {
    autoScalerOptions?: AutoScalerOptions;
    implementationConfig: AutoScalerImplementationConfig;
}