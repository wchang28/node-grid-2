import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {MsgBroker, IMessage, GridMessage, ISession, IGridUser} from '../gridClient';
import {ClientMessaging} from '../clientMessaging';

export interface IConnectionsContentProps {
    msgBroker: MsgBroker;
    session: ISession;
    currConnId: string;
}

export interface ITopicConnection {
    conn_id: string
    remoteAddress: string
    cookie: any;
}

export interface IConnectionsContentState {
    sub_id?:string;
    connections?: ITopicConnection[];
}

export class ConnectionsContent extends React.Component<IConnectionsContentProps, IConnectionsContentState> {
    constructor(props:IConnectionsContentProps) {
        super(props);
        this.state = {sub_id: null, connections:null};
    }
    protected get msgBroker(): MsgBroker {return this.props.msgBroker;}
    protected get session(): ISession {return this.props.session;}
    protected handleMessages(gMsg: GridMessage) : void {
        if (gMsg.type === 'connections-changed') {
            //console.log('receive <<connections-changed>');
            let connections: ITopicConnection[] = gMsg.content;
            this.setState({connections: connections});
        }     
    }
    private getConnections() : void {
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
    componentDidMount() {
        console.log('ConnectionsContent.componentDidMount()');
        this.getConnections();
        let sub_id = this.msgBroker.subscribe(ClientMessaging.getConnectionsTopic()
        ,(msg: IMessage) => {
            this.handleMessages(msg.body);
        }
        ,{}
        ,(err: any) => {
            if (err) {
                console.error('!!! Error: topic subscription failed');
            } else {
                console.log('topic subscribed sub_id=' + sub_id + " :-)");
                this.setState({sub_id});
            }
        });

    }
    componentWillUnmount() {
        console.log('ConnectionsContent.componentWillUnmount()');
        if (this.state.sub_id) {
            let sub_id = this.state.sub_id;
            this.msgBroker.unsubscribe(sub_id, (err:any) => {
                if (err)
                    console.error('!!! Error unsubscribing subscription ' + sub_id);
                else
                    console.log('successfully unsubscribed subscription ' + sub_id);
            });
        }
    }
    private getConnectionRows() {
        if (this.state.connections && this.state.connections.length > 0) {
            return this.state.connections.map((connection: ITopicConnection, index:number) => {
                let user:IGridUser= connection.cookie;
                return (
                    <tr key={index}>
                        <td>{index+1}</td>
                        <td>{connection.conn_id + (connection.conn_id === this.props.currConnId ? " (Me)": "")}</td>
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
    render() {
        return (
            <div>
                <div className="w3-row">
                    <div className="w3-col">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-light-blue">
                                <h6>Client Connections</h6>
                            </div>
                            <div className="w3-container w3-white">
                                <table className="w3-table w3-bordered w3-small">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Conn. Id</th>
                                            <th>Remote Address</th>
                                            <th>User Id</th>
                                            <th>Username</th>
                                            <th>Name</th>
                                            <th>Profile</th>
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