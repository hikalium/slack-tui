#!/usr/local/bin/node

const notifier = require('node-notifier');

class SlackChannel
{
	id: string;
	name: string;
	unread_count: number;
	constructor(id: string, name: string){
		this.id = id;
		this.name = name;
	}
	updateInfo(connection){
		connection.reqAPI('channels.info', {channel: this.id}, (data) => {
			if(!data.ok) return;
			this.name = data.channel.name;
			this.unread_count = data.channel.unread_count;
		});
	}
	updateHistory(connection, view, team){
		view.contentBox.setContent("");
		view.contentBox.setLabel(team.name + "/" + this.name);
		view.contentBox.log("Loading...");
		connection.reqAPI('channels.history', {channel: this.id}, (data) => {
			if(!data.ok) return;
			view.contentBox.setContent("");
			var messages = data.messages.map((e) => {
				var head = (team.getUserName(e.user) + "          ").substr(0, 10);
				return head + ":" + e.text;
			}).reverse();
			view.contentBox.log(messages.join("\n"));
		});
	}
}

class SlackRTMData
{
	static getChannelId(data){
		if(data.type === "message"){
			return data.channel;
		}
		return null;
	}
}

class SlackTeam
{
	static SlackAPI = require('slackbotapi');
	name: string = "";
	connection;
	channelList: SlackChannel[] = [];
	currentChannel: SlackChannel;
	token: string;
	userList;
	tui: SlackTUI;
	constructor(config, tui: SlackTUI)
	{
		this.tui = tui;
		this.name = config[1];
		this.token = config[0];
		this.connection = new SlackTeam.SlackAPI({
			"token": config[0],
			'logging': false,
			'autoReconnect': true
		});
		this.setRTMHandler();
		this.updateChannelList();
		this.updateUserList();
	}
	setRTMHandler() {
		this.connection.on('message', (data) => {
			// TODO: Improve performance (change to append new message only)
			var chName = this.getChannelNameById(SlackRTMData.getChannelId(data));
			if(chName) notifier.notify('New message on ' + this.name + "/" + chName);
			if(!this.tui.isTeamFocused(this)) return;
			this.selectChannel(this.currentChannel.name);
		});
	}
	channelSelectorList;
	private updateChannelList(){
		this.connection.reqAPI('channels.list', {token: this.token}, (data) => {
			if(!data.ok) return;
			this.channelList = data.channels.map(function(e){
				return new SlackChannel(e.id, e.name);
			});
			this.channelSelectorList = [];
			for(var ch of this.channelList){
				ch.updateInfo(this.connection);
				this.channelSelectorList.push(ch.name);
			}
			this.tui.requestUpdateChannelList(this);
		});
	}
	userSelectorList;
	private updateUserList(){
		this.connection.reqAPI('users.list', {token: this.token}, (data) => {
			if(!data.ok) return;
			this.userList = data.members.map(function(e){
				return [e.name, e.id];
			});
			this.userSelectorList = [];
			for(var t of this.userList){
				this.userSelectorList.push(t[0]);
			}
			this.tui.requestUpdateUserList(this);
		});
	}
	getChannelById(channelId: string): SlackChannel
	{
		for(var ch of this.channelList){
			if(ch.id == channelId) return ch;
		}
		return null;
	}
	getChannelNameById(channelId: string): string
	{
		var ch = this.getChannelById(channelId);
		if(ch) return ch.name;
		return null;
	}
	getChannelByName(channelName: string): SlackChannel
	{
		for(var ch of this.channelList){
			if(ch.name == channelName) return ch;
		}
		return null;
	}
	selectChannel(channelName: string){
		var ch = this.getChannelByName(channelName);
		if(!ch) return;
		this.currentChannel = ch;
		ch.updateHistory(this.connection, this.tui.view, this);
	}
	getUserName(userID: string){
		for(var u of this.userList){
			if(u[1] === userID) return u[0];
		}
		return null;
	}
	sendMessage(text: string){
		if(!this.currentChannel) return;
		this.postMessage(this.currentChannel.id, text);
	}
	private postMessage(channelID, text){
		var data: any = new Object();
		data.text = text;
		data.channel = channelID;
		data.as_user = true;
		// APIのchat.postMessageを使ってメッセージを送信する
		this.connection.reqAPI("chat.postMessage", data);
	}
}

class SlackTUIView
{
	teamBox;
	channelBox;
	userBox;
	inputBox;
	contentBox;
	screen;
	tui;
	constructor(tui: SlackTUI){
		this.tui = tui;
		const blessed = require('blessed');

		// Create a screen object.
		this.screen = blessed.screen({
			smartCSR: true,
			fullUnicode: true,
			dockBorders: true,
		});

		this.screen.title = 'slack-tui';

		this.teamBox = blessed.list({
			top: 0,
			left: 0,
			width: '25%',
			height: '25%+1',
			tags: true,
			border: {
				type: 'line'
			},
			label: ' Teams ',
			style: {
				border: {
					fg: '#f0f0f0'
				},
				selected: {
					bg: 'red'
				},
				focus: {
					border: {
						fg: '#00ff00'
					},
				},
			},
			keys: true,
		});
		this.screen.append(this.teamBox);


		this.channelBox = blessed.list({
			top: '25%',
			left: 0,
			width: '25%',
			height: '25%+1',
			tags: true,
			border: {
				type: 'line'
			},
			style: {
				//fg: 'white',
				//bg: 'magenta',
				border: {
					fg: '#f0f0f0'
				},
				selected: {
					bg: 'red'
				},
				focus: {
					border: {
						fg: '#00ff00'
					},
				},
			},
			label: ' Channels ',
			keys: true,
		});
		this.screen.append(this.channelBox);

		this.userBox = blessed.list({
			top: '50%',
			left: 0,
			width: '25%',
			height: '50%',
			tags: true,
			border: {
				type: 'line'
			},
			style: {
				//fg: 'white',
				//bg: 'magenta',
				border: {
					fg: '#f0f0f0'
				},
				selected: {
					bg: 'red'
				},
				focus: {
					border: {
						fg: '#00ff00'
					},
				},
			},
			label: ' Users ',
			keys: true,
		});
		this.screen.append(this.userBox);

		this.contentBox = blessed.log({
			top: 0,
			left: '25%',
			width: '75%',
			height: '80%+1',
			content: `
{green-bg}Welcome to SlackTUI!{/green-bg}
Use {red-fg}Tab{/red-fg} key to move box focus.
Use cursor keys to choose item.
			`,
			tags: true,
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: '#f0f0f0'
				},
				focus: {
					border: {
						fg: '#00ff00'
					},
				},
			},
			keys: true,
			scrollable: true,
		});
		this.screen.append(this.contentBox);

		this.inputBox = blessed.textbox({
			top: '80%',
			left: '25%',
			width: '75%',
			height: '20%+1',
			content: 'Hello {bold}world{/bold}!',
			tags: true,
			border: {
				type: 'line'
			},
			style: {
				fg: 'white',
				border: {
					fg: '#f0f0f0'
				},
				focus: {
					border: {
						fg: '#00ff00'
					},
				},
			},
			keys: true,
		});
		this.screen.append(this.inputBox);

		this.inputBox.on('submit', (text) => {
			this.inputBox.clearValue();
			this.inputBox.cancel();
			this.tui.sendMessage(text);
		});

		this.teamBox.on('select', (el, selected) => {

			var teamName = el.getText();
			this.tui.focusTeamByName(teamName);
		});

		this.channelBox.on('select', (el, selected) => {
			//contentBox.log(el.getText());
			this.tui.focusedTeam.selectChannel(el.getText());
		});


		this.screen.key(['C-c'], (ch, key) => {
			return process.exit(0);
		});

		this.screen.key(['t'], (ch, key) => {
			this.teamBox.focus();
		});

		this.teamBox.key(['tab'], (ch, key) => {
			this.channelBox.focus();
		});
		this.channelBox.key(['tab'], (ch, key) => {
			this.inputBox.focus();
		});
		this.inputBox.key(['tab'], (ch, key) =>  {
			this.contentBox.focus();
		});
		this.contentBox.key(['tab'], (ch, key) =>  {
			this.teamBox.focus();
		});


		this.teamBox.focus();

		this.screen.render();

	}
}

class SlackTUI
{
	fs = require("fs");
	configFile = 
		process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"] 
		+ "/.teamlist.json";
	tokenList = [];
	teamDict: {[key: string]: SlackTeam} = {};
	private focusedTeam: SlackTeam = null;
	view: SlackTUIView;
	constructor(){
		this.view = new SlackTUIView(this);
		try{
			var fval = this.fs.readFileSync(this.configFile);
			this.tokenList = JSON.parse(fval);
		} catch(e){
			this.view.contentBox.log(
				"Error: failed to read " + this.configFile);
			this.view.contentBox.log(
				"Please read https://github.com/hikalium/slack-tui/blob/master/README.md carefully.");
		}
		this.refreshTeamList();
	}
	refreshTeamList(){
		var teamSelectorList = [];
		for(var t of this.tokenList){
			teamSelectorList.push(t[1]);
			var team = new SlackTeam(t, this);
			this.teamDict[t[1]] = team;
		}
		this.view.teamBox.setItems(teamSelectorList);
		this.view.screen.render();
	}
	isTeamFocused(team: SlackTeam){
		return (this.focusedTeam === team);
	}
	requestUpdateChannelList(team: SlackTeam){
		if(!this.isTeamFocused(team)) return;
		this.view.channelBox.setItems(team.channelSelectorList);
		this.view.screen.render();
	}
	requestUpdateUserList(team: SlackTeam){
		if(!this.isTeamFocused(team)) return;
		this.view.userBox.setItems(team.userSelectorList);
		this.view.screen.render();
	}
	requestLogToContentBox(team: SlackTeam, data: string){
		if(!this.isTeamFocused(team)) return;
		this.view.contentBox.log(data);
		//this.screen.render();
	}
	requestClearContentBox(team: SlackTeam){
		if(!this.isTeamFocused(team)) return;
		this.view.contentBox.setContent("");
	}
	requestSetLabelOfContentBox(team: SlackTeam, label: string){
		if(!this.isTeamFocused(team)) return;
		this.view.contentBox.setLabel(" " + label + " ");
		this.view.contentBox.render();
	}
	focusTeamByName(teamName: string){
		if(this.teamDict[teamName]){
			this.focusedTeam = this.teamDict[teamName];
		}
		this.requestUpdateChannelList(this.focusedTeam);
		this.requestUpdateUserList(this.focusedTeam);
	}
	sendMessage(text: string){
		if(!this.focusedTeam) return;
		this.focusedTeam.sendMessage(text);
	}
}

var slackTUI = new SlackTUI();

