#!/usr/local/bin/node

const notifier = require('node-notifier');

interface SlackConversation
{
	updateContent();
	postMessage(text: string);
	getID(): string;
}

class SlackChannel implements SlackConversation
{
	team: SlackTeam;
	id: string;
	name: string;
	unread_count: number;
	private _isUpdatingInfo: boolean = false;
	constructor(team: SlackTeam, id: string, name: string){
		this.team = team;
		this.id = id;
		this.name = name;
	}
	isUpdatingInfo(){
		return this._isUpdatingInfo;
	}
	updateInfo(connection){
		this._isUpdatingInfo = true;
		connection.reqAPI('channels.info', {channel: this.id}, (data) => {
			this._isUpdatingInfo = false; 
			if(!data.ok) return;
			this.name = data.channel.name;
			this.unread_count = data.channel.unread_count;
			this.team.updateChannelListView();
		});
	}
	updateContent(){
		this.team.updateContent(this.id, "#" + this.name);
	}
	postMessage(text: string){
		this.team.postMessage(this.id, text);
	}
	getID(){
		return this.id;
	}
}

class SlackDM implements SlackConversation
{
	team: SlackTeam;
	id: string;
	name: string;
	constructor(team: SlackTeam, id: string, name: string){
		this.team = team;
		this.id = id;
		this.name = name;
	}
	updateContent(){
		this.team.updateContent(this.id, "@" + this.name);
	}
	postMessage(text: string){
		this.team.postMessage(this.id, text);
	}
	getID(){
		return this.id;
	}
}

class SlackUser
{
	team: SlackTeam;
	id: string;
	name: string;
	constructor(team: SlackTeam, id: string, name: string){
		this.team = team;
		this.id = id;
		this.name = name;
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
	currentConversation: SlackConversation;
	token: string;
	userList: SlackUser[];
	tui: SlackTUI;
	isNotificationSuppressed: boolean = false;
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
			this.tui.view.contentBox.log(JSON.stringify(data) + "\n");
			var channel_id = SlackRTMData.getChannelId(data);
			if(this.currentConversation && this.currentConversation.getID() === channel_id){
				// TODO: Improve performance (change to append new message only)
				this.currentConversation.updateContent();
			}
			if(!this.isNotificationSuppressed){
				notifier.notify('New message on ' + this.name);
			}
		});
	}
	updateChannelListView(){
		for(var ch of this.channelList){
			if(ch.isUpdatingInfo()) return;
		}
		log("done: " + this.name);
		var channelSelectorList = [];
		for(var ch of this.channelList){
			channelSelectorList.push(ch.name + "(" + ch.unread_count + ")");
		}	
		if(!this.tui.isTeamFocused(this)) return;
		this.tui.view.channelBox.setItems(channelSelectorList);
		this.tui.view.screen.render();
	}
	private updateChannelList(){
		this.connection.reqAPI('channels.list', {token: this.token}, (data) => {
			if(!data.ok) return;
			this.channelList = data.channels.map((e) => {
				var ch = new SlackChannel(this, e.id, e.name);
				ch.updateInfo(this.connection);
				return ch;
			});
			this.updateChannelListView();
		});
	}
	userSelectorList;
	private updateUserList(){
		this.connection.reqAPI('users.list', {token: this.token}, (data) => {
			if(!data.ok) return;
			this.userList = data.members.map(function(e){
				return new SlackUser(this, e.id, e.name);
			});
			this.userSelectorList = [];
			for(var u of this.userList){
				this.userSelectorList.push("@" + u.name);
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
	getChannelByName(channelName: string): SlackChannel
	{
		for(var ch of this.channelList){
			if(ch.name == channelName) return ch;
		}
		return null;
	}
	private getCanonicalChannelName(str: string)
	{
		return str.replace(/\(.*\)/g, "");
	}
	selectChannel(channelName: string){
		var ch = this.getChannelByName(this.getCanonicalChannelName(channelName));
		if(!ch) return;
		this.currentConversation = ch;
		ch.updateContent();
	}
	getUserName(userID: string){
		for(var u of this.userList){
			if(u.id === userID) return u.name;
		}
		return null;
	}
	sendMessage(text: string){
		if(!this.currentConversation) return;
		this.currentConversation.postMessage(text);
	}
	postMessage(channelID, text){
		var data: any = new Object();
		data.text = text;
		data.channel = channelID;
		data.as_user = true;

		this.isNotificationSuppressed = true;
		setTimeout(()=>{ this.isNotificationSuppressed = false; }, 1000);
		// APIのchat.postMessageを使ってメッセージを送信する
		this.connection.reqAPI("chat.postMessage", data);
	}
	updateContent(id, name_for_id){
		var view = this.tui.view;
		var connection = this.connection;
		view.contentBox.setContent("");
		view.contentBox.setLabel(this.name + "/" + name_for_id);
		view.contentBox.log(`Loading ${name_for_id}(${id}) ...`);
		connection.reqAPI('conversations.history', {channel: id}, (data) => {
			if(!data.ok){
				view.contentBox.log("Failed: " + JSON.stringify(data) + "\n");
				return;
			}
			view.contentBox.setContent("");
			var messages = data.messages.map((e) => {
				var head = (this.getUserName(e.user) + "          ").substr(0, 10);
				return head + ":" + e.text;
			}).reverse();
			view.contentBox.log(messages.join("\n"));
		});
	}
	openIM(user_id, name_for_id){
		var view = this.tui.view;
		var connection = this.connection;
		view.contentBox.setContent("");
		view.contentBox.setLabel(this.name + "/@" + name_for_id);
		view.contentBox.log(`Opening IM with @${name_for_id}(${user_id}) ...`);
		connection.reqAPI('im.open', {user: user_id}, (data) => {
			if(!data.ok){
				view.contentBox.log("Failed: " + JSON.stringify(data) + "\n");
				return;
			}
			var channel_id = data.channel.id;
			this.currentConversation = new SlackDM(this, channel_id, name_for_id);
			this.currentConversation.updateContent();
		});
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
			var teamName = this.tui.getCanonicalTeamName(el.getText());
			this.tui.focusTeamByName(teamName);
		});

		this.channelBox.on('select', (el, selected) => {
			this.tui.focusedTeam.selectChannel(el.getText());
		});

		this.userBox.on('select', (el, selected) => {
			var index = this.userBox.getItemIndex(el);
			if(!this.tui.focusedTeam) return;
			var u: SlackUser = this.tui.focusedTeam.userList[index];
			if(u){
				this.tui.focusedTeam.openIM(u.id, u.name)
			}
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
			this.userBox.focus();
		});
		this.userBox.key(['tab'], (ch, key) => {
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
	getCanonicalTeamName(str: string)
	{
		return str.replace(/\(.*\)/g, "");
	}
	refreshTeamList(){
		var teamSelectorList = [];
		for(var t of this.tokenList){
			teamSelectorList.push(t[1] + "(*)");
			var team = new SlackTeam(t, this);
			this.teamDict[t[1]] = team;
		}
		this.view.teamBox.setItems(teamSelectorList);
		this.view.screen.render();
	}
	isTeamFocused(team: SlackTeam){
		return (this.focusedTeam === team);
	}
	requestUpdateUserList(team: SlackTeam){
		if(!this.isTeamFocused(team)) return;
		if(!team.userSelectorList) return;
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
		if(!this.teamDict[teamName]) return;
		this.focusedTeam = this.teamDict[teamName];
		this.focusedTeam.updateChannelListView();
		this.requestUpdateUserList(this.focusedTeam);
	}
	sendMessage(text: string){
		if(!this.focusedTeam) return;
		this.focusedTeam.sendMessage(text);
	}
}

var slackTUI = new SlackTUI();

var log = function(str){
	slackTUI.view.contentBox.log(str);
}

