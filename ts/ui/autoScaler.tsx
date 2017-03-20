import * as React from 'react';
import {Utils, IGridAutoScalerJSON, AutoScalerImplementationInfo, IMessageClient, GridMessage, IGridAutoScaler} from 'grid-client-core';

interface IAutoScalerProps {
    autoScalerAvailable: boolean
    gridAutoScaler: IGridAutoScaler
    msgClient: IMessageClient<GridMessage>;
}

interface IAutoScalerState {
    sub_id?: string;
    autoScalerJSON?: IGridAutoScalerJSON;
    autoScalerImplementationInfo?: AutoScalerImplementationInfo;
}

export class AutoScaler extends React.Component<IAutoScalerProps, IAutoScalerState> {
    constructor(props:IAutoScalerProps) {
        super(props);
        this.state = {
            sub_id: null
            ,autoScalerJSON: null
            ,autoScalerImplementationInfo: null
        };
    }
    protected get msgClient(): IMessageClient<GridMessage> {return this.props.msgClient;}
    protected get GridAutoScaler(): IGridAutoScaler {return this.props.gridAutoScaler;}
    private getAutoScalerJSON() {
        this.GridAutoScaler.getJSON()
        .then((autoScalerJSON: IGridAutoScalerJSON) => {
            this.setState({autoScalerJSON})
        }).catch((err: any) => {
            console.error('!!! Error getting auto-scaler json');
        });
    }
    private getAutoScalerImplementationInfo() {
        this.session.GridAutoScaler.getImplementationInfo()
        .then((autoScalerImplementationInfo: AutoScalerImplementationInfo) => {
            this.setState({autoScalerImplementationInfo})
        }).catch((err: any) => {
            console.error('!!! Error getting auto-scaler config url');
        });
    }

    componentDidMount() {
        console.log('HomeContent.componentDidMount()');
        if (this.props.autoScalerAvailable) {
            this.getAutoScalerJSON();
            this.getAutoScalerImplementationInfo();
            this.msgClient.subscribe(Utils.getAutoScalerTopic(), this.handleMessages.bind(this), {})
            .then((sub_id: string) => {
                console.log('autoscaler topic subscribed, sub_id=' + sub_id + " :-)");
                this.setState({sub_id});
            }).catch((err: any) => {
                console.error('!!! Error: topic subscription failed');
            });
        }
    }
    componentWillUnmount() {
        console.log('HomeContent.componentWillUnmount()');
        if (this.state.sub_id) {
            let sub_id = this.state.sub_id;
            this.msgClient.unsubscribe(sub_id)
            .then(() => {
                console.log('successfully unsubscribed subscription ' + sub_id);
            }).catch((err: any) => {
                console.error('!!! Error unsubscribing subscription ' + sub_id);
            });
        }
    }
    render() {
    }
}