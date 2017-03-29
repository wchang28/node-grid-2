import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IMessageClient, GridMessage, Utils, ISession, IGridUser, IDispatcherJSON, INodeItem, IDispControl, IQueueJSON, Times, IGridAutoScalerJSON, AutoScalerImplementationInfo} from 'grid-client-core';
import {AutoScalerUI} from './autoScaler';

export interface IHomeContentProps {
    msgClient: IMessageClient<GridMessage>;
    session: ISession;
    currentUser: IGridUser;
    autoScalerAvailable: boolean;
}

export interface IHomeContentState {
    disp_sub_id?:string;
    nodes?: INodeItem[];
    queue?:IQueueJSON;
    dispControl?: IDispControl;
    timer?: any;
    times?: Times;
}

export class HomeContent extends React.Component<IHomeContentProps, IHomeContentState> {
    constructor(props:IHomeContentProps) {
        super(props);
        this.state = {disp_sub_id: null, timer: null, times: null};
    }
    protected get msgClient(): IMessageClient<GridMessage> {return this.props.msgClient;}
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

    private getEnableFlagCellContent(enabled?: boolean) : any {
        if (typeof enabled === 'boolean') {
            if (enabled)
                return <span className="w3-text-green w3-medium"><i className="fa fa-check-circle"></i></span>;
            else
                return <span className="w3-text-red w3-medium"><i className="fa fa-times-circle"></i></span>;
        } else
            return <span className="w3-medium"><i className="fa fa-question"></i></span>;
    }

    private getNodeStateCellContent(nodeItem: INodeItem) : any {
        if (nodeItem.terminating)
            return <span>{"Terminating... "}<span className="w3-medium"><i className="fa fa-spinner fa-spin"></i></span></span>
        else
            return this.getEnableFlagCellContent(nodeItem.enabled);
    }
    private getNodeRows() : any {
        if (this.state.nodes && this.state.nodes.length > 0) {
            return this.state.nodes.map((nodeItem: INodeItem, index:number) => {
                let rowClass = (nodeItem.terminating ? "w3-light-grey w3-text-grey" : "w3-white w3-text-black");
                return (
                    <tr key={index} className={rowClass}>
                        <td>{index+1}</td>
                        <td>{nodeItem.id}</td>
                        <td>{nodeItem.name}</td>
                        <td>{nodeItem.remoteAddress+":"+nodeItem.remotePort.toString()}</td>
                        <td>{this.geUtilizationString(nodeItem.cpusUsed, nodeItem.numCPUs, false)}</td>
                        <td>{this.getIdleMinutesString(nodeItem.lastIdleTime)}</td>
                        <td>{this.getNodeStateCellContent(nodeItem)}</td>
                        <td><button disabled={nodeItem.terminating || !this.props.currentUser.profile.canEnableDisableNode} onClick={this.getNodeEnableDisableClickHandler(index)}>{nodeItem.enabled ? "Disable" : "Enable"}</button></td>
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

    render() {
        return (
            <div>
                <div className="w3-row">
                    <div className="w3-col m7">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-blue">
                                <h6>Nodes {this.getGridUtilizationString()}</h6>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered w3-small w3-centered">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Id</th>
                                            <th>Name</th>
                                            <th>Remote Addr.</th>
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
                    <div className="w3-col m5">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-blue">
                                <h6>Queue</h6>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered w3-small w3-centered">
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
                                            <td>{this.getEnableFlagCellContent(this.state.dispControl ? this.state.dispControl.dispatchEnabled : null)}</td>
                                            <td>
                                                <button disabled={!this.props.currentUser.profile.canStartStopDispatching} onClick={this.onDispatchingEnableClick.bind(this)}>{!this.state.dispControl || this.state.dispControl.dispatchEnabled ? "Disable" : "Enable"}</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <AutoScalerUI userProfile={this.props.currentUser.profile} autoScalerAvailable={this.props.autoScalerAvailable} gridAutoScaler={this.session.GridAutoScaler} msgClient={this.msgClient} times={this.state.times}/>
                    </div>
                </div>
            </div>
        );
    }
}