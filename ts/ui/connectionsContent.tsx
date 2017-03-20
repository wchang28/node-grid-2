import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IMessageClient, GridMessage, Utils, ISession, IGridUser} from 'grid-client-core';
import {ITopicConnectionJSON, Subscription} from "rcf-message-router";

export interface IConnectionsContentProps {
    msgClient: IMessageClient<GridMessage>;
    session: ISession;
    currConnId: string;
}

export interface IConnectionsContentState {
    sub_id?:string;
    connections?: ITopicConnectionJSON[];
}

export class ConnectionsContent extends React.Component<IConnectionsContentProps, IConnectionsContentState> {
    constructor(props:IConnectionsContentProps) {
        super(props);
        this.state = {sub_id: null, connections:null};
    }
    protected get msgClient(): IMessageClient<GridMessage> {return this.props.msgClient;}
    protected get session(): ISession {return this.props.session;}
    protected handleMessages(gMsg: GridMessage) : void {
        if (gMsg.type === 'connections-changed') {
            //console.log('receive <<connections-changed>');
            let connections: ITopicConnectionJSON[] = gMsg.content;
            this.setState({connections: connections});
        }     
    }
    private getConnections() : void {
        this.session.getConnections()
        .then((connections: ITopicConnectionJSON[]) => {
            this.setState({
                connections: connections
            });
        }).catch((err: any) => {
            console.error('!!! Error getting client connections');
        });
    }
    componentDidMount() {
        console.log('ConnectionsContent.componentDidMount()');
        this.getConnections();
        this.msgClient.subscribe(Utils.getConnectionsTopic(), this.handleMessages.bind(this), {})
        .then((sub_id: string) => {
            console.log('topic subscribed sub_id=' + sub_id + " :-)");
            this.setState({sub_id});
        }).catch((err: any) => {
            console.error('!!! Error: topic subscription failed');
        });
    }
    componentWillUnmount() {
        console.log('ConnectionsContent.componentWillUnmount()');
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
    private getSubsText(subs: {[sub_id: string]:Subscription}): string {
        let items:string[] = [];
        for (let sub_id in subs) {
            let sub = subs[sub_id];
            let dest = sub.dest;
            let item = [sub_id, dest].join("=>");
            items.push(item);
        }
        return (items.length > 0 ? JSON.stringify(items, null, 2): "");
    }
    private getConnectionRows() : any {
        if (this.state.connections && this.state.connections.length > 0) {
            return this.state.connections.map((connection: ITopicConnectionJSON, index:number) => {
                let user:IGridUser = connection.cookie;
                let subs = connection.subs;
                return (
                    <tr key={index}>
                        <td>{index+1}</td>
                        <td>{connection.id + (connection.id === this.props.currConnId ? " (Me)": "")}</td>
                        <td>{connection.remoteAddress}</td>
                        <td>{user.userId}</td>
                        <td>{user.userName}</td>
                        <td>{user.displayName}</td>
                        <td>{user.profile.name}</td>
                        <td>{this.getSubsText(subs)}</td>
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
    render() {
        return (
            <div>
                <div className="w3-row">
                    <div className="w3-col">
                        <div className="w3-card-4 w3-margin">
                            <div className="w3-container w3-blue">
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
                                            <th>Topics Sub.</th>
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