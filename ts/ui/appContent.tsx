import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IMessageClient, ISession, IGridUser} from '../gridBrowserClient';
import * as homeContent from "./homeContent";
import * as jobsContent from "./jobsContent";
import * as connectionsContent from "./connectionsContent";

export enum ContentType {
    Home = 1
    ,Jobs = 2
    ,Connections = 3
};

export interface IAppContentProps {
    msgClient: IMessageClient;
    session: ISession;
    contentType: ContentType;
    currConnId: string;
    currentUser: IGridUser
    autoScalerAvailable: boolean;
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
                    return (<homeContent.HomeContent msgClient={this.props.msgClient} session={this.props.session} currentUser={this.props.currentUser} autoScalerAvailable={this.props.autoScalerAvailable}/>);
               case ContentType.Jobs:
                    return (<jobsContent.JobsContent msgClient={this.props.msgClient} session={this.props.session} currentUser={this.props.currentUser}/>);
                case ContentType.Connections:
                    return (<connectionsContent.ConnectionsContent msgClient={this.props.msgClient} session={this.props.session} currConnId={this.props.currConnId}/>);
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