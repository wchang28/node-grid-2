import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
import * as ajaxon from 'ajaxon';
require('eventsource-polyfill');
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {GridMessage, IJobProgress} from '../messaging';
import {IDispatcherJSON} from '../dispatcher';
import {ClientMessaging} from '../clientMessaging';

let $J = ajaxon($);
let EventSource = window['EventSource'];
let eventSourceUrl = '/services/events/event_stream';

interface IGridAdminAppProps {
}

interface IGridAdminAppState {
    conn_id?: string;
    sub_id?: string
    dispatcherJSON?:IDispatcherJSON;
    jobsProgress?: IJobProgress[];
}

class GridAdminApp extends React.Component<IGridAdminAppProps, IGridAdminAppState> {
    private msgBroker: MsgBroker = new MsgBroker(() => new MessageClient(EventSource, $, eventSourceUrl), 10000);
    constructor(props:IGridAdminAppProps) {
        super(props);
        this.state = {};
        this.state.conn_id = null;
        this.state.sub_id = null;
        this.state.dispatcherJSON = null;
        this.state.jobsProgress = null;
    }
    componentDidMount() {
        $J('GET', '/services/dispatcher', {}, (err: any, dispatcherJSON: IDispatcherJSON) => {
            if (err)
                console.error('!!! Error getting dispatcher sate');
            else {
                //console.log(JSON.stringify(dispatcherJSON));
                this.setState({dispatcherJSON: dispatcherJSON});
            }
        });
        //console.log('componentDidMount()')
        this.msgBroker.on('connect', (conn_id:string) => {
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.setState({conn_id: conn_id});
            let sub_id = this.msgBroker.subscribe(ClientMessaging.getDispatcherTopic()
            ,(msg: IMessage) => {
                let gMsg: GridMessage = msg.body;
                if (gMsg.type === 'changed') {
                    //console.log('receive <<changed>>');
                    let dispatcherJSON: IDispatcherJSON = gMsg.content;
                    this.setState({dispatcherJSON: dispatcherJSON});
                } else if (gMsg.type === 'jobs-tracking-changed') {
                    //console.log('receive <<jobs-tracking-changed>>');
                    let jobsProgress: IJobProgress[] = gMsg.content;
                    this.setState({jobsProgress: jobsProgress});
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
    render() {
        return (
            <div>
                <div className="w3-container w3-pale-green">
                    <h2>Dispatcher</h2>
                </div>
                <div className="w3-container w3-white">
                    <table className="w3-table w3-bordered w3-striped">
                        <thead>
                            <tr><th>Item</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Priorities in queue</td><td>{this.state.dispatcherJSON ? this.state.dispatcherJSON.queue.priorities.join(',') : " "}</td></tr>
                            <tr><td>No. jobs in queue</td><td>{this.state.dispatcherJSON ? this.state.dispatcherJSON.queue.numJobs : " "}</td></tr>
                            <tr><td>No. tasks in queue</td><td>{this.state.dispatcherJSON ? this.state.dispatcherJSON.queue.numTasks : " "}</td></tr>
                            <tr><td>Queue closed</td><td>{this.state.dispatcherJSON ? this.booleanString(this.state.dispatcherJSON.queueClosed) : " "}</td></tr>
                            <tr><td>Dispatching enabled</td><td>{this.state.dispatcherJSON ? this.booleanString(this.state.dispatcherJSON.dispatchEnabled) : " "}</td></tr>
                            <tr><td>Dispatching</td><td>{this.state.dispatcherJSON ? this.booleanString(this.state.dispatcherJSON.dispatching) : " "}</td></tr>
                            <tr><td>No. of outstanding ACKs</td><td>{this.state.dispatcherJSON ? this.state.dispatcherJSON.numOutstandingAcks : " "}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            );
    }
}

ReactDOM.render(<GridAdminApp/>, document.getElementById('main'));