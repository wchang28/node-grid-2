import {MsgBroker, MsgBrokerStates, MessageClient, IMessage} from 'message-broker';
let EventSource = require('eventsource');
let $ = require('jquery-no-dom');

let url = 'http://127.0.0.1:26354/node-app/events/event_stream';
let eventSourceInitDict = null;

let msgBorker = new MsgBroker(() => new MessageClient(EventSource, $, url, eventSourceInitDict) , 10000);

msgBorker.on('connect', (conn_id:string) : void => {
    console.log('connected: conn_id=' + conn_id);
    let sub_id = msgBorker.subscribe('/topic/node/' + conn_id, (msg: IMessage): void => {
         console.log('msg-rcvd: ' + JSON.stringify(msg));
    }, {}, (err: any): void => {
        if (err) {
            console.error('!!! Error: topic subscription failed');
        } else {
            console.log('topic subscribed sub_id=' + sub_id + " :-)");
            console.log('sending a test message...');
            msgBorker.send('/topic/dispatcher', {}, {type:'node-ready', content: {numCPUs: 34} }, (err: any) : void => {
                if (err) {
                    console.error('!!! Error: message send failed');
                } else {
                    console.log('message sent successfully :-)');
                    /*
                    setTimeout(() : void => {
                        console.log('unscribing the topic...');
                        msgBorker.unsubscribe(sub_id, (err:any):void => {
                            if (err) {
                                console.error('!!! Error: unscribed failed');
                            } else {
                                console.log('topic unsubscribed :-)'); 
                                msgBorker.disconnect();
                                console.log('disconnected :-)'); 
                            }
                        });                        
                    }, 10000);
                    */
                }
            });
        }
    });
});

msgBorker.on('error', (err: any) : void => {
    console.error('!!! Error:' + JSON.stringify(err));
});

msgBorker.connect();
