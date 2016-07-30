import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
import {MsgBroker} from 'message-broker';
import {IGridUser} from '../messaging';
import {GridClient, ISession} from '../gridClient';
import {IGridJobSubmit, ITaskItem} from '../gridClient';
import * as appContent from './appContent';

interface IGridAdminAppProps {
    currentUser: IGridUser
}

interface IGridAdminAppState {
    contentType?: appContent.ContentType;
    conn_id?: string;
}

class GridAdminApp extends React.Component<IGridAdminAppProps, IGridAdminAppState> {
    private session: ISession = GridClient.webSession($);
    private msgBroker: MsgBroker = null;
    constructor(props:IGridAdminAppProps) {
        super(props);
        this.msgBroker = this.session.createMsgBroker(2000);
        this.state = {contentType: appContent.ContentType.Home};
        this.state.conn_id = null;
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
    private getOnSubmitTestEchoJobHandler(numTasks:number) {
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
        this.msgBroker.on('connect', (conn_id:string) => {
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.setState({conn_id: conn_id});
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
                            <a href="#" onClick={this.getOnSubmitTestEchoJobHandler(100)}>100 Echos</a>
                            <a href="#" onClick={this.getOnSubmitTestEchoJobHandler(1000)}>1000 Echos</a>
                            <a href="#">20 Sleeps(15sec)</a>
                            <a href="#" onClick={this.getOnSubmitTestEchoJobHandler(10000)}>10000 Echos</a>
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