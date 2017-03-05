import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as $ from 'jquery';
import {IMessageClient, GridClient, ISession, IGridJobSubmit, ITaskItem, IGridUser, IJobProgress} from '../gridBrowserClient';
import * as appContent from './appContent';
import {TestJobs} from '../test/testJobs';
import {run as runSomeTestJob} from '../test/runSomeTestJob';

interface IGridAdminAppProps {
    currentUser: IGridUser;
    session: ISession;
}

interface IGridAdminAppState {
    contentType?: appContent.ContentType;
    conn_id?: string;
}

class GridAdminApp extends React.Component<IGridAdminAppProps, IGridAdminAppState> {
    private msgClient: IMessageClient = null;
    constructor(props:IGridAdminAppProps) {
        super(props);
        this.state = {contentType: appContent.ContentType.Home, conn_id: null};
    }
    protected get session() : ISession {return this.props.session;}
    private getOnSubmitTestEchoJobHandler(numTasks:number) {
        return (event: any) => {
            this.session.sumbitJob(TestJobs.getEchoTestJob(numTasks))
            .then((jp: IJobProgress) => {
                console.log('test job submitted, jobId=' + jp.jobId);
            }).catch((err: any) => {
                console.log('!!! Error submitting job: ' + JSON.stringify(err));
            });
            return false;
        };
    }
    private onSubmitTestSleepJob(event: any) {
        this.session.sumbitJob(TestJobs.getSleepTestJob())
        .then((jp: IJobProgress) => {
            console.log('test job submitted, jobId=' + jp.jobId);
        }).catch((err: any) => {
            console.log('!!! Error submitting job: ' + JSON.stringify(err));
        });
        return false;
    }
    private onRunSomeTestJob(event: any) {
        runSomeTestJob(this.session)
        .then(() => {

        }).catch((err: any) => {
            console.log('!!! Error running job: ' + JSON.stringify(err));
        });
        return false;
    }
    componentDidMount() {
        this.msgClient = this.props.session.createMsgClient();
		$(window).on('hashchange', () => {
			//alert('hash change: ' + window.location.hash);
            let contentType: appContent.ContentType = appContent.ContentType.Home;
            if (window.location.hash.length > 0) {
                let s = window.location.hash.substr(1);
                if (s === 'Current')
                    contentType = this.state.contentType;
                else if (s === 'Connections')
                    contentType = appContent.ContentType.Connections;
                else if (s === "Jobs")
                    contentType = appContent.ContentType.Jobs
            }
            this.setState({contentType});
		});
        this.msgClient.on('connect', (conn_id:string) => {
            console.log('connected to the dispatcher: conn_id=' + conn_id);
            this.setState({conn_id: conn_id});
        }).on('error', (err: any) => {
            console.error('!!! Error:' + JSON.stringify(err));
            this.setState({conn_id: null});
        });
    }
    componentWillUnmount() {
        //console.log('componentWillUnmount()')
        this.msgClient.disconnect();
    }
    onLogout(e:any) {
        this.session.logout();
    }
    getAppContent() : any {
        return (<appContent.AppContent msgClient={this.msgClient} contentType={this.state.contentType} currConnId={this.state.conn_id} session={this.session} currentUser={this.props.currentUser}/>);
    }
    render() {
        let currentUserName = this.props.currentUser.displayName + ' ';
        return (
            <div>
                <ul className="w3-navbar w3-black">
                    <li><a href="#"><i className="fa fa-home w3-large"></i></a></li>
                    <li><a href="#Jobs">Jobs</a></li>
                    <li><a href="#Connections">Connections</a></li>
                    <li className="w3-dropdown-hover">
                        <a href="javascript:void(0)">Test Jobs</a>
                        <div className="w3-dropdown-content w3-white w3-card-4">
                            <a href="#Current" onClick={this.getOnSubmitTestEchoJobHandler(100)}>100 Echos</a>
                            <a href="#Current" onClick={this.getOnSubmitTestEchoJobHandler(1000)}>1000 Echos</a>
                            <a href="#Current" onClick={this.onSubmitTestSleepJob.bind(this)}>15 Sleeps (10sec)</a>
                            <a href="#Current" onClick={this.getOnSubmitTestEchoJobHandler(10000)}>10000 Echos</a>
                            <a href="#Current" onClick={this.onRunSomeTestJob.bind(this)}>Run Some Test Job</a>
                        </div>
                    </li>
                    <li className="w3-right"><a href="#Current" onClick={this.onLogout.bind(this)}>{currentUserName}<i className="fa fa-sign-out"></i></a></li>
                </ul>
                <div>{this.getAppContent()}</div> 
            </div>
        );
    }
}

//console.log('__currentUser='+JSON.stringify(global['__currentUser']));
ReactDOM.render(<GridAdminApp currentUser={global['__currentUser']} session={GridClient.getSession()}/>, document.getElementById('main'));