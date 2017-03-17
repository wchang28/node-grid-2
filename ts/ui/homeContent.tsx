import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IMessageClient, GridMessage, Utils, ISession, IGridUser, IDispatcherJSON, INodeItem, IDispControl, IQueueJSON, Times, IGridAutoScalerJSON, AutoScalerImplementationInfo} from 'grid-client-core';

export interface IHomeContentProps {
    msgClient: IMessageClient;
    session: ISession;
    currentUser: IGridUser;
    autoScalerAvailable: boolean;
}

export interface IHomeContentState {
    disp_sub_id?:string;
    autoscaler_sub_id?:string;
    nodes?: INodeItem[];
    queue?:IQueueJSON;
    dispControl?: IDispControl;
    timer?: any;
    times?: Times;
    autoScalerJSON?: IGridAutoScalerJSON;
    autoScalerImplementationInfo?: AutoScalerImplementationInfo;
}

export class HomeContent extends React.Component<IHomeContentProps, IHomeContentState> {
    constructor(props:IHomeContentProps) {
        super(props);
        this.state = {disp_sub_id: null, autoscaler_sub_id: null, timer: null, times: null, autoScalerJSON: null, autoScalerImplementationInfo: null};
    }
    protected get msgClient(): IMessageClient {return this.props.msgClient;}
    protected get session(): ISession {return this.props.session;}
    protected handleMessages(gMsg: GridMessage) : void {
        if (gMsg.type === 'ctrl-changed') {
            //console.log('receive <<ctrl-changed>');
            let dispControl: IDispControl = gMsg.content;
            this.setState({dispControl: dispControl});
        } else if (gMsg.type === 'nodes-changed') {
            //console.log('receive <<nodes-changed>>');
            let nodes: INodeItem[] = gMsg.content;
            this.setState({nodes: nodes});
        } else if (gMsg.type === 'queue-changed') {
            //console.log('receive <<queue-changed>>: ' + JSON.stringify(gMsg.content));
            let queue: IQueueJSON = gMsg.content;
            this.setState({queue: queue});
        } else if (gMsg.type === 'autoscaler-changed') {
            this.getAutoScalerJSON();
        }
    }
    private getDispatcherJSON() : void {
        this.session.getDispatcherJSON()
        .then((dispatcherJSON: IDispatcherJSON) => {
            this.setState({
                nodes: dispatcherJSON.nodes
                ,queue: dispatcherJSON.queue
                ,dispControl: dispatcherJSON.dispControl
            });
        }).catch((err: any) => {
            console.error('!!! Error getting dispatcher state');
        });
    }
    private getServerTimes() {
        this.session.getTimes()
        .then((times: Times) => {
            this.setState({times});
        }).catch((err: any) => {
            console.error('!!! Error getting server times');
        });       
    }
    private getAutoScalerJSON() {
        this.session.GridAutoScaler.getJSON()
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
        this.getServerTimes();
        this.state.timer = setInterval(this.getServerTimes.bind(this), 15000);
        this.getDispatcherJSON();
        this.msgClient.subscribe(Utils.getDispatcherTopic(), this.handleMessages.bind(this), {})
        .then((disp_sub_id: string) => {
            console.log('dispatcher topic subscribed, sub_id=' + disp_sub_id + " :-)");
            this.setState({disp_sub_id});
        }).catch((err: any) => {
            console.error('!!! Error: topic subscription failed');
        });
        if (this.props.autoScalerAvailable) {
            this.getAutoScalerJSON();
            this.getAutoScalerImplementationInfo();
            this.msgClient.subscribe(Utils.getAutoScalerTopic(), this.handleMessages.bind(this), {})
            .then((autoscaler_sub_id: string) => {
                console.log('autoscaler topic subscribed, sub_id=' + autoscaler_sub_id + " :-)");
                this.setState({autoscaler_sub_id});
            }).catch((err: any) => {
                console.error('!!! Error: topic subscription failed');
            });
        }
    }
    componentWillUnmount() {
        console.log('HomeContent.componentWillUnmount()');
        if (this.state.timer) clearInterval(this.state.timer);
        if (this.state.disp_sub_id) {
            let sub_id = this.state.disp_sub_id;
            this.msgClient.unsubscribe(sub_id)
            .then(() => {
                console.log('successfully unsubscribed subscription ' + sub_id);
            }).catch((err: any) => {
                console.error('!!! Error unsubscribing subscription ' + sub_id);
            });
        }
        if (this.state.autoscaler_sub_id) {
            let sub_id = this.state.autoscaler_sub_id;
            this.msgClient.unsubscribe(sub_id)
            .then(() => {
                console.log('successfully unsubscribed subscription ' + sub_id);
            }).catch((err: any) => {
                console.error('!!! Error unsubscribing subscription ' + sub_id);
            });
        }
    }
    private booleanString(val: boolean) : string {return (val ? "Yes": "No");}
    private geUtilizationString(used:number, total: number, showPercent:boolean=true) : string {
        if (!total)
            return "0/0" + (showPercent ? "=0.00%" : "");
        else
            return used.toString() + "/" + total.toString() + (showPercent ? "=" + (used/total*100.0).toFixed(2) + "%" : "");
    }
    private getGridUtilizationString() : string {
        let numUsed = 0;
        let numTotal = 0;
        if (this.state.nodes && this.state.nodes.length > 0) {
            for (let i in this.state.nodes) {
                let nodeItem:INodeItem = this.state.nodes[i];
                if (nodeItem.enabled) {
                    numUsed += nodeItem.cpusUsed;
                    numTotal += nodeItem.numCPUs;
                }
            }
        }
        return " (" + this.geUtilizationString(numUsed, numTotal, true) + ")";
    }
    private getNodeEnableDisableClickHandler(index: number) : (e:any) => void {
        return ((e:any):void => {
            let nodeItem = this.state.nodes[index];
            let nodeId=nodeItem.id;
            this.session.setNodeEnabled(nodeId, !nodeItem.enabled)
            .then((nodeItem: INodeItem) => {

            }).catch((err: any) => {
                console.error('!!! Error enable/disable node: ' + JSON.stringify(err));
            });
        });
    }
    private getIdleMinutesString(lastIdleTime?: number) : string {
        if (typeof lastIdleTime === "number" && this.state.times && this.state.times.serverTime) {
            let t = Math.round(Math.max(this.state.times.serverTime - lastIdleTime, 0)/1000.0/60.0);
            return t.toString() + " min.";
        } else
            return "";
    }
    private getNodeRows() : any {
        if (this.state.nodes && this.state.nodes.length > 0) {
            return this.state.nodes.map((nodeItem: INodeItem, index:number) => {
                return (
                    <tr key={index}>
                        <td>{index+1}</td>
                        <td>{nodeItem.id}</td>
                        <td>{nodeItem.name}</td>
                        <td>{nodeItem.remoteAddress+":"+nodeItem.remotePort.toString()}</td>
                        <td>{this.booleanString(nodeItem.enabled)}</td>
                        <td>{this.geUtilizationString(nodeItem.cpusUsed, nodeItem.numCPUs, false)}</td>
                        <td>{this.getIdleMinutesString(nodeItem.lastIdleTime)}</td>
                        <td>{nodeItem.terminating ? "Terminating..." : "Good"}</td>
                        <td><button disabled={!this.props.currentUser.profile.canEnableDisableNode} onClick={this.getNodeEnableDisableClickHandler(index)}>{nodeItem.enabled ? "Disable" : "Enable"}</button></td>
                    </tr>
                );
            });
        } else {
            return (
                <tr>
                    <td>(None)</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            );
        }
    }
    private onQueueCloseClick(e:any) {
        if (this.state.dispControl) {
            this.session.setQueueOpened(this.state.dispControl.queueClosed)
            .then((dispControl: IDispControl) => {
                this.setState({dispControl});
            }).catch((err: any) => {
                console.error('!!! Error opening/closing queue: ' + JSON.stringify(err));
            });
        }
    }
    private onDispatchingEnableClick(e:any) {
        if (this.state.dispControl) {
            this.session.setDispatchingEnabled(!this.state.dispControl.dispatchEnabled)
            .then((dispControl: IDispControl) => {
                this.setState({dispControl});
            }).catch((err: any) => {
                console.error('!!! Unable to start/stop task dispatching: ' + JSON.stringify(err));
            });
        }        
    }

    private get AutoScalerAvailable(): boolean {return this.props.autoScalerAvailable};
    private get AutoScalerJSON(): IGridAutoScalerJSON {return this.state.autoScalerJSON;}
    private get AutoScalerImplInfo(): AutoScalerImplementationInfo {return this.state.autoScalerImplementationInfo;}
    // TODO: check profile
    private get AllowToChangeAutoScalerConfig() : boolean {
        if (!this.AutoScalerAvailable)
            return false;
        else if (!this.AutoScalerJSON)
            return false;
        else
            return true;
    }
    private get AutoScalerEnabledText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? this.booleanString(this.AutoScalerJSON.Enabled) : null) : "N/A");}
    private get AutoScalerScalingText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? (this.AutoScalerJSON.ScalingUp ? "Scaling up...": "Idle") : null) : "N/A");}
    private get AutoScalerMaxNodesText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? this.AutoScalerJSON.MaxWorkersCap.toString() : null) : "N/A");}
    private get AutoScalerMinNodesText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? this.AutoScalerJSON.MinWorkersCap.toString() : null) : "N/A");}
    private get AutoScalerNodeLaunchingTimeoutText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? this.AutoScalerJSON.LaunchingTimeoutMinutes.toString() + " min." : null) : "N/A");}
    private get AutoScalerTerminateWorkerAfterMinutesIdleText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? this.AutoScalerJSON.TerminateWorkerAfterMinutesIdle.toString() + " min." : null) : "N/A");}
    private get AutoScalerRampUpSpeedRatioText() : string {return (this.AutoScalerAvailable ? (this.AutoScalerJSON ? this.AutoScalerJSON.RampUpSpeedRatio.toString() : null) : "N/A");}
    private get AutoScalerImplName() : string {return (this.AutoScalerAvailable ? (this.AutoScalerImplInfo ? this.AutoScalerImplInfo.Name : null) : "N/A");}
    private get HasAutoScalerImplSetupUI() : boolean {return (this.AutoScalerAvailable ? (this.AutoScalerImplInfo ? this.AutoScalerImplInfo.HasSetupUI : false) : false);}
    private get AutoScalerImplSetupUILinkEnabled() : boolean {return this.AllowToChangeAutoScalerConfig && this.HasAutoScalerImplSetupUI;}
    private get AutoScalerImplSetupUIUrl() : string {return (this.HasAutoScalerImplSetupUI ? "autoscaler/implementation" : "#");}

    private onAutoScalerEnableClick(e:any) {
        if (this.state.autoScalerJSON) {
            let p = (this.state.autoScalerJSON.Enabled ? this.session.GridAutoScaler.disable() : this.session.GridAutoScaler.enable());
            p.then(() => {

            }).catch((err: any) => {
                console.error('!!! Unable to enable/disable auto-scaler: ' + JSON.stringify(err));
            });
        }
    }
    render() {
        return (
            <div>
                <div className="w3-row">
                    <div className="w3-col m8">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-blue">
                                <h6>Nodes {this.getGridUtilizationString()}</h6>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered w3-small">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Id</th>
                                            <th>Name</th>
                                            <th>Remote Addr.</th>
                                            <th>Enabled</th>
                                            <th>Usage</th>
                                            <th>Idle Time</th>
                                            <th>State</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>{this.getNodeRows()}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div className="w3-col m4">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-blue">
                                <h6>Queue</h6>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered w3-small">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Value</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Priorities in queue</td>
                                            <td>{this.state.queue ? this.state.queue.priorities.join(',') : " "}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>No. job(s) in queue</td>
                                            <td>{this.state.queue ? this.state.queue.numJobs : " "}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>No. task(s) in queue</td>
                                            <td>{this.state.queue ? this.state.queue.numTasks : " "}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Queue closed</td>
                                            <td>{this.state.dispControl ? this.booleanString(this.state.dispControl.queueClosed) : " "}</td>
                                            <td>
                                                <button disabled={!this.props.currentUser.profile.canOpenCloseQueue} onClick={this.onQueueCloseClick.bind(this)}>{!this.state.dispControl || this.state.dispControl.queueClosed ? "Open" : "Close"}</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Task dispatching enabled</td>
                                            <td>{this.state.dispControl ? this.booleanString(this.state.dispControl.dispatchEnabled) : " "}</td>
                                            <td>
                                                <button disabled={!this.props.currentUser.profile.canStartStopDispatching} onClick={this.onDispatchingEnableClick.bind(this)}>{!this.state.dispControl || this.state.dispControl.dispatchEnabled ? "Disable" : "Enable"}</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-blue">
                                <h6>Auto-Scaler ({this.props.autoScalerAvailable ? "Available" : "N/A"})</h6>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered w3-small">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Value</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Enabled</td>
                                            <td>{this.AutoScalerEnabledText}</td>
                                            <td><button disabled={!this.AllowToChangeAutoScalerConfig} onClick={this.onAutoScalerEnableClick.bind(this)}>{!this.state.autoScalerJSON || this.state.autoScalerJSON.Enabled ? "Disable" : "Enable"}</button></td>
                                        </tr>
                                        <tr>
                                            <td>Scaling</td>
                                            <td>{this.AutoScalerScalingText}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Max. # of nodes</td>
                                            <td>{this.AutoScalerMaxNodesText}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Min. # of nodes</td>
                                            <td>{this.AutoScalerMinNodesText}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Node launching timeout</td>
                                            <td>{this.AutoScalerNodeLaunchingTimeoutText}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Terminate node after idle for </td>
                                            <td>{this.AutoScalerTerminateWorkerAfterMinutesIdleText}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Ramp up speed ratio</td>
                                            <td>{this.AutoScalerRampUpSpeedRatioText}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Implementation Name</td>
                                            <td>{this.AutoScalerImplName}</td>
                                            <td></td>
                                        </tr>
                                        <tr>
                                            <td>Additional config.</td>
                                            <td></td>
                                            <td><a disabled={!this.AutoScalerImplSetupUILinkEnabled} href={this.AutoScalerImplSetupUIUrl}>Click Here</a></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}