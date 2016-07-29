import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
import {IGridUser, GridMessage, IJobProgress} from '../messaging';
//import {IDispatcherJSON, INodeItem, IQueueJSON, IDispControl} from '../dispatcher';
import {ClientMessaging} from '../clientMessaging';
import {GridClient, ISession} from '../gridClient';
import {IGridJobSubmit, ITaskItem} from '../gridClient';
import * as appContent from './appContent';

interface ITopicConnection {
    conn_id: string
    remoteAddress: string
    cookie: any;
}

interface IGridAdminAppProps {
    currentUser: IGridUser
}

interface IGridAdminAppState {
    contentType?: appContent.ContentType;
    conn_id?: string;
    connections?: ITopicConnection[];
}

class GridAdminApp extends React.Component<IGridAdminAppProps, IGridAdminAppState> {
    private session: ISession = GridClient.webSession($);
    private msgBroker: MsgBroker = null;
    constructor(props:IGridAdminAppProps) {
        super(props);
        this.msgBroker = this.session.createMsgBroker(2000);
        this.state = {contentType: appContent.ContentType.Home};
        this.state.conn_id = null;
        this.state.connections = null;
    }
    private getTestJobSubmit(numTasks:number) : IGridJobSubmit {
        let js:IGridJobSubmit = {
            description: 'this is a test'
            ,cookie: 'test'
            ,tasks: []
        };

        for (let i = 0; i < numTasks; i++) {
            let task: ITaskItem  = {
                cmd: 'echo Hi everybody'
                ,cookie: (i+1).toString()
            }
            js.tasks.push(task);
        }
        return js;
    }
    private getOnSubmitTestEchoJob(numTasks:number) {
        return (event: any) => {
            event.preventDefault();
            this.session.sumbitJob(this.getTestJobSubmit(numTasks), (err:any, jobId:string) => {
                if (err)
                    console.log('!!! Error submitting job: ' + JSON.stringify(err));
                else
                    console.log('test job submitted, jobId=' + jobId);
            });
        };
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
    private handleConnectionsMessages(gMsg: GridMessage) : void {
        if (gMsg.type === 'connections-changed') {
            //console.log('receive <<connections-changed>');
            let connections: ITopicConnection[] = gMsg.content;
            this.setState({connections: connections});
        }     
    }
    componentDidMount() {
		$(window).on('hashchange', () => {
			//alert('hash change: ' + window.location.hash);
            let contentType: appContent.ContentType = appContent.ContentType.Home;
            if (window.location.hash.length > 0) {
                let s = window.location.hash.substr(1);
                if (s === 'Connections')
                    contentType = appContent.ContentType.Connections;
                else if (s === "Jobs")
                    contentType = appContent.ContentType.Jobs
            }
            this.setState({contentType});
		});

        //console.log('componentDidMount():' + JSON.stringify(this.props.currentUser));
        this.msgBroker.on('connect', (conn_id:string) => {
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.getConnections();
            this.setState({conn_id: conn_id});
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
                        <td>{user.profile.name}</td>
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
                </tr>
            );
        }
    }
    onLogout(e:any) {
        this.session.logout();
    }
    getAppContent() : any {
        return (<appContent.AppContent msgBroker={this.msgBroker} contentType={this.state.contentType} currConnId={this.state.conn_id} session={this.session} currentUser={this.props.currentUser}/>);
    }
    render() {
        let currentUserName = this.props.currentUser.displayName + ' ';
        return (
            <div>
                <ul className="w3-navbar w3-black">
                    <li><a href="#"><i className="fa fa-home w3-large"></i></a></li>
                    <li><a href="#Connections">Connections</a></li>
                    <li><a href="#Jobs">Jobs</a></li>
                    <li className="w3-dropdown-hover">
                        <a href="javascript:void(0)">Test Jobs</a>
                        <div className="w3-dropdown-content w3-white w3-card-4">
                            <a href="#" onClick={this.getOnSubmitTestEchoJob(100)}>100 Echos</a>
                            <a href="#" onClick={this.getOnSubmitTestEchoJob(1000)}>1000 Echos</a>
                            <a href="#">20 Sleeps(15sec)</a>
                            <a href="#" onClick={this.getOnSubmitTestEchoJob(10000)}>10000 Echos</a>
                        </div>
                    </li>
                    <li className="w3-right"><a href="#" onClick={this.onLogout.bind(this)}>{currentUserName}<i className="fa fa-sign-out"></i></a></li>
                </ul>
                <div>{this.getAppContent()}</div> 
            </div>
        );
    }
}

//console.log('__currentUser='+JSON.stringify(global['__currentUser']));
ReactDOM.render(<GridAdminApp currentUser={global['__currentUser']}/>, document.getElementById('main'));