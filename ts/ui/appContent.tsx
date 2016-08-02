import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {MsgBroker, ISession, IGridUser} from '../gridClient';
import * as homeContent from "./homeContent";
import * as jobsContent from "./jobsContent";
import * as connectionsContent from "./connectionsContent";

export enum ContentType {
    Home = 1
    ,Jobs = 2
    ,Connections = 3
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
    private getContent() : any {
        if (this.props.currConnId === null) {
            return (<div>Not connected</div>);
        } else {
            switch(this.props.contentType) {
                case ContentType.Home:
                    return (<homeContent.HomeContent msgBroker={this.props.msgBroker} session={this.props.session} currentUser={this.props.currentUser}/>);
               case ContentType.Jobs:
                    return (<jobsContent.JobsContent msgBroker={this.props.msgBroker} session={this.props.session}/>);
                case ContentType.Connections:
                    return (<connectionsContent.ConnectionsContent msgBroker={this.props.msgBroker} session={this.props.session} currConnId={this.props.currConnId}/>);
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