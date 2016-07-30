import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {MsgBroker} from 'message-broker';
import {ISession} from '../gridClient';
import {IGridUser} from '../messaging';
import * as homeContent from "./homeContent";
import * as connectionsContent from "./connectionsContent";

export enum ContentType {
    Home = 1
    ,Connections = 2
    ,Jobs = 3
};

export interface IAppContentProps {
    msgBroker: MsgBroker;
    session: ISession;
    contentType: ContentType;
    currConnId: string;
    currentUser: IGridUser
}

export interface IAppContentState {}

export class AppContent extends React.Component<IAppContentProps, IAppContentState> {
    constructor(props:IAppContentProps) {
        super(props);
        this.state = {};
    }
    getContent() : any {
        if (this.props.currConnId === null) {
            return (<div>Not connected</div>);
        } else {
            switch(this.props.contentType) {
                case ContentType.Home:
                    return (<homeContent.HomeContent msgBroker={this.props.msgBroker} session={this.props.session} currentUser={this.props.currentUser}/>);
                case ContentType.Connections:
                    return (<connectionsContent.ConnectionsContent msgBroker={this.props.msgBroker} session={this.props.session} currConnId={this.props.currConnId}/>);
                case ContentType.Jobs:
                    return (<div>Jobs</div>);
                default:
                    return (<div>Unknown content !!!</div>);
            }
        }
    }
    componentDidMount() {
        console.log('AppContent.componentDidMount()');
    }
    componentWillUnmount() {
        console.log('AppContent.componentWillUnmount()');
    }
    render() {
        return (
            <div>{this.getContent()}</div>
        );
    }
}