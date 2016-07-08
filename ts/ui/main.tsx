import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
require('eventsource-polyfill');
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {GridMessage, IJobProgress} from '../messaging';
import {IDispatcherJSON} from '../dispatcher';
import {ClientMessaging} from '../clientMessaging';

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
        this.state.conn_id = null;
        this.state.sub_id = null;
        this.state.dispatcherJSON = null;
        this.state.jobsProgress = null;
    }
    componentDidMount() {
        this.msgBroker.on('connected', (conn_id:string) => {
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.setState({conn_id: conn_id});
            let sub_id = this.msgBroker.subscribe(ClientMessaging.getDispatcherTopic()
            ,(msg: IMessage) => {
                let gMsg: GridMessage = msg.body;
                if (gMsg.type === 'changed') {
                    console.log('receive <<changed>>');
                    let dispatcherJSON: IDispatcherJSON = gMsg.content;
                    this.setState({dispatcherJSON: dispatcherJSON});
                } else if (gMsg.type === 'jobs-tracking-changed') {
                    console.log('receive <<jobs-tracking-changed>>');
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
        this.msgBroker.disconnect();
    }
    render() {
        return <div>Hello World</div>;
    }
}

ReactDOM.render(<GridAdminApp/>, document.getElementById('main'));