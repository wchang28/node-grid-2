import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
import * as ajaxon from 'ajaxon';
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {GridMessage, IJobProgress} from '../messaging';
import {IDispatcherJSON, INodeItem, IQueueJSON, IDispControl} from '../dispatcher';
import {ClientMessaging} from '../clientMessaging';

let $J = ajaxon($);

let EventSource = global['EventSource'];
let eventSourceUrl = '/services/events/event_stream';

interface IGridAdminAppProps {
}

interface IGridAdminAppState {
    conn_id?: string;
    sub_id?: string;
    nodes?: INodeItem[];
    queue?:IQueueJSON;
    dispControl?: IDispControl;
}

class GridAdminApp extends React.Component<IGridAdminAppProps, IGridAdminAppState> {
    private msgBroker: MsgBroker = new MsgBroker(() => new MessageClient(EventSource, $, eventSourceUrl), 2000);
    constructor(props:IGridAdminAppProps) {
        super(props);
        this.state = {};
        this.state.conn_id = null;
        this.state.sub_id = null;
        this.state.nodes = null;
        this.state.queue = null;
        this.state.dispControl = null;
    }
    private pollDispatcher() {
        $J('GET', '/services/dispatcher', {}, (err: any, dispatcherJSON: IDispatcherJSON) => {
            if (err)
                console.error('!!! Error getting dispatcher sate');
            else {
                //console.log(JSON.stringify(dispatcherJSON));
                this.setState({
                    nodes: dispatcherJSON.nodes
                    ,queue: dispatcherJSON.queue
                    ,dispControl: dispatcherJSON.dispControl
                });
            }
        });
    }
    componentDidMount() {
        //console.log('componentDidMount()')
        this.msgBroker.on('connect', (conn_id:string) => {
            this.pollDispatcher();
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.setState({conn_id: conn_id});
            let sub_id = this.msgBroker.subscribe(ClientMessaging.getDispatcherTopic()
            ,(msg: IMessage) => {
                let gMsg: GridMessage = msg.body;
                if (gMsg.type === 'ctrl-changed') {
                    //console.log('receive <<ctrl-changed>');
                    let dispControl: IDispControl = gMsg.content;
                    this.setState({dispControl: dispControl});
                } else if (gMsg.type === 'nodes-changed') {
                    //console.log('receive <<nodes-changed>>');
                    let nodes: INodeItem[] = gMsg.content;
                    this.setState({nodes: nodes});
                } else if (gMsg.type === 'queue-changed') {
                    console.log('receive <<queue-changed>>: ' + JSON.stringify(gMsg.content));
                    let queue: IQueueJSON = gMsg.content;
                    this.setState({queue: queue});
                }
            }
            ,{}
            ,(err: any) => {
                if (err) {
                    console.error('!!! Error: topic subscription failed');
                } else {
                    this.setState({sub_id: sub_id});
                    console.log('topic subscribed sub_id=' + sub_id + " :-)");
                }
            });
        }).on('error', (err: any) => {
            console.error('!!! Error:' + JSON.stringify(err));
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
            let nodId=nodeItem.id;
            if (nodeItem.enabled) {
                $J("GET", "/services/dispatcher/node/" + nodId + "/disable", {}, (err:any, ret: any) => {
                    if (err) {
                        console.error('!!! Error disable node: ' + JSON.stringify(err));
                    }
                });
            }
            else {
                $J("GET", "/services/dispatcher/node/" + nodId + "/enable", {}, (err:any, ret: any) => {
                    if (err) {
                        console.error('!!! Error enable node: ' + JSON.stringify(err));
                    }
                });
            }
        });
    }
    getNodrRow() {
        if (this.state.nodes && this.state.nodes.length > 0) {
            return this.state.nodes.map((nodeItem: INodeItem, index:number) => {
                return (
                    <tr>
                        <td>{index+1}</td>
                        <td>{nodeItem.id}</td>
                        <td>{nodeItem.name}</td>
                        <td>{this.booleanString(nodeItem.enabled)}</td>
                        <td>{this.geUtilizationString(nodeItem.cpusUsed, nodeItem.numCPUs, false)}</td>
                        <td><button onClick={this.getNodeEnableDisableClickHandler(index)}>{nodeItem.enabled ? "Disable" : "Enable"}</button></td>
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
                                    <tbody>{this.getNodrRow()}</tbody>
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
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr><td>Priorities in queue</td><td>{this.state.queue ? this.state.queue.priorities.join(',') : " "}</td></tr>
                                        <tr><td>No. job(s) in queue</td><td>{this.state.queue ? this.state.queue.numJobs : " "}</td></tr>
                                        <tr><td>No. task(s) in queue</td><td>{this.state.queue ? this.state.queue.numTasks : " "}</td></tr>
                                        <tr><td>Queue closed</td><td>{this.state.dispControl ? this.booleanString(this.state.dispControl.queueClosed) : " "}</td></tr>
                                        <tr><td>Task dispatching enabled</td><td>{this.state.dispControl ? this.booleanString(this.state.dispControl.dispatchEnabled) : " "}</td></tr>
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

ReactDOM.render(<GridAdminApp/>, document.getElementById('main'));

/*
let msgBroker: MsgBroker = new MsgBroker(() => new MessageClient(EventSource, $, eventSourceUrl), 2000);

msgBroker.on('connect', (conn_id:string) => {
    console.log('connected to the dispatcher: conn_id=' + conn_id);
    let sub_id = msgBroker.subscribe(ClientMessaging.getDispatcherTopic()
    ,(msg: IMessage) => {
        let gMsg: GridMessage = msg.body;
        if (gMsg.type === 'ctrl-changed') {
            //console.log('receive <<ctrl-changed>');
            let dispControl: IDispControl = gMsg.content;
        } else if (gMsg.type === 'nodes-changed') {
            //console.log('receive <<nodes-changed>>');
            let nodes: INodeItem[] = gMsg.content;
        } else if (gMsg.type === 'queue-changed') {
            console.log('receive <<queue-changed>>: ' + JSON.stringify(gMsg.content));
            let queue: IQueueJSON = gMsg.content;
        }
    }
    ,{}
    ,(err: any) => {
        if (err) {
            console.error('!!! Error: topic subscription failed');
        } else {
            console.log('topic subscribed sub_id=' + sub_id + " :-)");
        }
    });
}).on('error', (err: any) => {
    console.error('!!! Error:' + JSON.stringify(err));
});

msgBroker.connect();
*/