import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {IGridUser, GridMessage, IJobProgress} from '../messaging';
import {IDispatcherJSON, INodeItem, IQueueJSON, IDispControl} from '../dispatcher';
import {ClientMessaging} from '../clientMessaging';
import {GridClient, ISession} from '../gridClient';
import {IGridJobSubmit, ITaskItem} from '../gridClient';

interface ITopicConnection {
    conn_id: string
    remoteAddress: string
    cookie: any;
}

interface IGridAdminAppProps {
    currentUser: IGridUser
}

interface IGridAdminAppState {
    conn_id?: string;
    nodes?: INodeItem[];
    queue?:IQueueJSON;
    dispControl?: IDispControl;
    connections?: ITopicConnection[];
}

class GridAdminApp extends React.Component<IGridAdminAppProps, IGridAdminAppState> {
    private session: ISession = GridClient.webSession($);
    private msgBroker: MsgBroker = null;
    constructor(props:IGridAdminAppProps) {
        super(props);
        this.msgBroker = this.session.createMsgBroker(2000);
        this.state = {};
        this.state.conn_id = null;
        this.state.nodes = null;
        this.state.queue = null;
        this.state.dispControl = null;
        this.state.connections = null;
    }
    private getTestJobSubmit() : IGridJobSubmit {
        let js:IGridJobSubmit = {
            description: 'this is a test'
            ,cookie: 'test'
            ,tasks: []
        };

        for (let i = 0; i < 1000; i++) {
            let task: ITaskItem  = {
                cmd: 'echo Hi everybody'
                ,cookie: (i+1).toString()
            }
            js.tasks.push(task);
        }
        return js;
    }
    private onSubmitTestJob() {
        this.session.sumbitJob(this.getTestJobSubmit(), (err:any, jobId:string) => {
            if (err)
                console.log('!!! Error submitting job: ' + JSON.stringify(err));
            else
                console.log('test job mitted, jobId=' + jobId);
        });
    }
    private getDispatcherJSON() {
        this.session.getDispatcherJSON((err: any, dispatcherJSON: IDispatcherJSON) => {
            if (err)
                console.error('!!! Error getting dispatcher state');
            else {
                this.setState({
                    nodes: dispatcherJSON.nodes
                    ,queue: dispatcherJSON.queue
                    ,dispControl: dispatcherJSON.dispControl
                });
            }            
        });
    }
    private getConnections() {
        this.session.getConnections((err: any, connections: ITopicConnection[]) => {
            if (err)
                console.error('!!! Error getting client connections');
            else {
                this.setState({
                    connections: connections
                });
            }
        });
    }
    private handleDispatcherMessages(gMsg: GridMessage) : void {
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
    private handleConnectionsMessages(gMsg: GridMessage) : void {
        if (gMsg.type === 'connections-changed') {
            //console.log('receive <<connections-changed>');
            let connections: ITopicConnection[] = gMsg.content;
            this.setState({connections: connections});
        }     
    }
    componentDidMount() {
        //console.log('componentDidMount():' + JSON.stringify(this.props.currentUser));
        this.msgBroker.on('connect', (conn_id:string) => {
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.getDispatcherJSON();
            this.getConnections();
            this.setState({conn_id: conn_id});
            let sub_id_1 = this.msgBroker.subscribe(ClientMessaging.getDispatcherTopic()
            ,(msg: IMessage) => {
                this.handleDispatcherMessages(msg.body);
            }
            ,{}
            ,(err: any) => {
                if (err) {
                    console.error('!!! Error: topic subscription failed');
                } else {
                    console.log('topic subscribed sub_id=' + sub_id_1 + " :-)");
                }
            });
            let sub_id_2 = this.msgBroker.subscribe(ClientMessaging.getConnectionsTopic()
            ,(msg: IMessage) => {
                this.handleConnectionsMessages(msg.body);
            }
            ,{}
            ,(err: any) => {
                if (err) {
                    console.error('!!! Error: topic subscription failed');
                } else {
                    console.log('topic subscribed sub_id=' + sub_id_2 + " :-)");
                }
            });
        }).on('error', (err: any) => {
            console.error('!!! Error:' + JSON.stringify(err));
            this.setState({conn_id: null});
        });
        this.msgBroker.connect();
    }
    componentWillUnmount() {
        //console.log('componentWillUnmount()')
        this.msgBroker.disconnect();
    }
    booleanString(val: boolean) : string {return (val ? "Yes": "No");}
    geUtilizationString(used:number, total: number, showPercent:boolean=true) : string {
        if (total === 0)
            return "0/0" + (showPercent ? "=0.00%" : "");
        else
            return used.toString() + "/" + total.toString() + (showPercent ? "=" + (used/total*100.0).toFixed(2) + "%" : "");
    }
    getGridUtilizationString() : string {
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
    getNodeEnableDisableClickHandler(index: number) : (e:any) => void {
        return ((e:any):void => {
            let nodeItem = this.state.nodes[index];
            let nodeId=nodeItem.id;
            this.session.setNodeEnabled(nodeId, !nodeItem.enabled, (err:any, nodeItem: INodeItem) => {
                if (err) {
                    console.error('!!! Error enable/disable node: ' + JSON.stringify(err));
                }
            });
        });
    }
    getNodRows() {
        if (this.state.nodes && this.state.nodes.length > 0) {
            return this.state.nodes.map((nodeItem: INodeItem, index:number) => {
                return (
                    <tr key={index}>
                        <td>{index+1}</td>
                        <td>{nodeItem.id}</td>
                        <td>{nodeItem.name}</td>
                        <td>{this.booleanString(nodeItem.enabled)}</td>
                        <td>{this.geUtilizationString(nodeItem.cpusUsed, nodeItem.numCPUs, false)}</td>
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
                </tr>
            );
        }
    }
    getConnectionRows() {
        if (this.state.connections && this.state.connections.length > 0) {
            return this.state.connections.map((connection: ITopicConnection, index:number) => {
                let user:IGridUser= connection.cookie;
                return (
                    <tr key={index}>
                        <td>{index+1}</td>
                        <td>{connection.conn_id + (connection.conn_id === this.state.conn_id ? " (Me)": "")}</td>
                        <td>{connection.remoteAddress}</td>
                        <td>{user.userId}</td>
                        <td>{user.userName}</td>
                        <td>{user.displayName}</td>
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
                </tr>
            );
        }
    }
    onQueueCloseClick(e:any) {
        if (this.state.dispControl) {
            this.session.setQueueOpened(this.state.dispControl.queueClosed, (err:any, dispControl: IDispControl) => {
                if (err) {
                    console.error('!!! Error opening/closing queue: ' + JSON.stringify(err));
                } else {
                    this.setState({dispControl: dispControl});
                }
            });
        }
    }
    onDispatchingEnableClick(e:any) {
        if (this.state.dispControl) {
            this.session.setDispatchingEnabled(!this.state.dispControl.dispatchEnabled, (err:any, dispControl: IDispControl) => {
                if (err) {
                    console.error('!!! Unable to start/stop task dispatching: ' + JSON.stringify(err));
                } else {
                    this.setState({dispControl: dispControl});
                }
            });
        }        
    }
    onLogout(e:any) {
        this.session.logout((err:any) => {});
    }
    render() {
        return (
            <div>
                <div className="w3-row">
                    <div className="w3-col m8">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-pale-green">
                                <h4>Nodes {this.getGridUtilizationString()}</h4>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Id</th>
                                            <th>Name</th>
                                            <th>Enabled</th>
                                            <th>Usage</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>{this.getNodRows()}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div className="w3-col m4">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-pale-green">
                                <h4>Queue</h4>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered">
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
                                                <button disbaled={!this.props.currentUser.profile.canOpenCloseQueue} onClick={this.onQueueCloseClick.bind(this)}>{!this.state.dispControl || this.state.dispControl.queueClosed ? "Open" : "Close"}</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Task dispatching enabled</td>
                                            <td>{this.state.dispControl ? this.booleanString(this.state.dispControl.dispatchEnabled) : " "}</td>
                                            <td>
                                                <button disbaled={!this.props.currentUser.profile.canStartStopDispatching} onClick={this.onDispatchingEnableClick.bind(this)}>{!this.state.dispControl || this.state.dispControl.dispatchEnabled ? "Disable" : "Enable"}</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Submit test job</td>
                                            <td></td>
                                            <td>
                                                <button disbaled={!this.props.currentUser.profile.canSubmitJob} onClick={this.onSubmitTestJob.bind(this)}>Submit</button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Logout</td>
                                            <td></td>
                                            <td>
                                                <button onClick={this.onLogout.bind(this)}>Logout</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="w3-row">
                    <div className="w3-col">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-pale-green">
                                <h4>Client Connections</h4>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Conn. Id</th>
                                            <th>Remote Address</th>
                                            <th>User Id</th>
                                            <th>Username</th>
                                            <th>Name</th>
                                        </tr>
                                    </thead>
                                    <tbody>{this.getConnectionRows()}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

ReactDOM.render(<GridAdminApp currentUser={global['__currentUser']}/>, document.getElementById('main'));