import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IMessageClient, GridMessage, Utils, ISession, IGridUser, IDispatcherJSON, INodeItem, IDispControl, IQueueJSON, Times} from '../gridBrowserClient';

export interface IHomeContentProps {
    msgClient: IMessageClient;
    session: ISession;
    currentUser: IGridUser;
    autoScalerAvailable: boolean;
}

export interface IHomeContentState {
    sub_id?:string;
    nodes?: INodeItem[];
    queue?:IQueueJSON;
    dispControl?: IDispControl;
    timer?: any;
    times?: Times;
}

export class HomeContent extends React.Component<IHomeContentProps, IHomeContentState> {
    constructor(props:IHomeContentProps) {
        super(props);
        this.state = {sub_id: null, timer: null, times: null};
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
        this.getServerTimes();
        this.state.timer = setInterval(this.getServerTimes.bind(this), 15000);
        console.log('HomeContent.componentDidMount()');
        this.getDispatcherJSON();
        this.msgClient.subscribe(Utils.getDispatcherTopic(), this.handleMessages.bind(this), {})
        .then((sub_id: string) => {
            console.log('topic subscribed sub_id=' + sub_id + " :-)");
            this.setState({sub_id});
        }).catch((err: any) => {
            console.error('!!! Error: topic subscription failed');
        });
    }
    componentWillUnmount() {
        if (this.state.timer) clearInterval(this.state.timer);
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
                    </div>
                </div>
            </div>
        );
    }
}