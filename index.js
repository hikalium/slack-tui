#!/usr/local/bin/node
var notifier = require('node-notifier');
var SlackChannel = /** @class */ (function () {
    function SlackChannel(team, id, name) {
        this._isUpdatingInfo = false;
        this.team = team;
        this.id = id;
        this.name = name;
    }
    SlackChannel.prototype.isUpdatingInfo = function () {
        return this._isUpdatingInfo;
    };
    SlackChannel.prototype.updateInfo = function (connection) {
        var _this = this;
        this._isUpdatingInfo = true;
        connection.reqAPI('channels.info', { channel: this.id }, function (data) {
            _this._isUpdatingInfo = false;
            if (!data.ok)
                return;
            _this.name = data.channel.name;
            _this.unread_count = data.channel.unread_count;
            _this.team.updateChannelListView();
        });
    };
    SlackChannel.prototype.updateContent = function () {
        this.team.updateContent(this.id, "#" + this.name);
    };
    SlackChannel.prototype.postMessage = function (text) {
        this.team.postMessage(this.id, text);
    };
    SlackChannel.prototype.getID = function () {
        return this.id;
    };
    return SlackChannel;
}());
var SlackDM = /** @class */ (function () {
    function SlackDM(team, id, name) {
        this.team = team;
        this.id = id;
        this.name = name;
    }
    SlackDM.prototype.updateContent = function () {
        this.team.updateContent(this.id, "@" + this.name);
    };
    SlackDM.prototype.postMessage = function (text) {
        this.team.postMessage(this.id, text);
    };
    SlackDM.prototype.getID = function () {
        return this.id;
    };
    return SlackDM;
}());
var SlackUser = /** @class */ (function () {
    function SlackUser(team, id, name) {
        this.team = team;
        this.id = id;
        this.name = name;
    }
    return SlackUser;
}());
var SlackRTMData = /** @class */ (function () {
    function SlackRTMData() {
    }
    SlackRTMData.getChannelId = function (data) {
        if (data.type === "message") {
            return data.channel;
        }
        return null;
    };
    return SlackRTMData;
}());
var SlackTeam = /** @class */ (function () {
    function SlackTeam(config, tui) {
        this.name = "";
        this.channelList = [];
        this.isNotificationSuppressed = false;
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
    SlackTeam.prototype.setRTMHandler = function () {
        var _this = this;
        this.connection.on('message', function (data) {
            _this.tui.view.contentBox.log(JSON.stringify(data) + "\n");
            var channel_id = SlackRTMData.getChannelId(data);
            if (_this.currentConversation && _this.currentConversation.getID() === channel_id) {
                // TODO: Improve performance (change to append new message only)
                _this.currentConversation.updateContent();
            }
            if (!_this.isNotificationSuppressed) {
                notifier.notify('New message on ' + _this.name);
            }
        });
    };
    SlackTeam.prototype.updateChannelListView = function () {
        for (var _i = 0, _a = this.channelList; _i < _a.length; _i++) {
            var ch = _a[_i];
            if (ch.isUpdatingInfo())
                return;
        }
        log("done: " + this.name);
        var channelSelectorList = [];
        for (var _b = 0, _c = this.channelList; _b < _c.length; _b++) {
            var ch = _c[_b];
            channelSelectorList.push(ch.name + "(" + ch.unread_count + ")");
        }
        if (!this.tui.isTeamFocused(this))
            return;
        this.tui.view.channelBox.setItems(channelSelectorList);
        this.tui.view.screen.render();
    };
    SlackTeam.prototype.updateChannelList = function () {
        var _this = this;
        this.connection.reqAPI('channels.list', { token: this.token }, function (data) {
            if (!data.ok)
                return;
            _this.channelList = data.channels.map(function (e) {
                var ch = new SlackChannel(_this, e.id, e.name);
                ch.updateInfo(_this.connection);
                return ch;
            });
            _this.updateChannelListView();
        });
    };
    SlackTeam.prototype.updateUserList = function () {
        var _this = this;
        this.connection.reqAPI('users.list', { token: this.token }, function (data) {
            if (!data.ok)
                return;
            _this.userList = data.members.map(function (e) {
                return new SlackUser(this, e.id, e.name);
            });
            _this.userSelectorList = [];
            for (var _i = 0, _a = _this.userList; _i < _a.length; _i++) {
                var u = _a[_i];
                _this.userSelectorList.push("@" + u.name);
            }
            _this.tui.requestUpdateUserList(_this);
        });
    };
    SlackTeam.prototype.getChannelById = function (channelId) {
        for (var _i = 0, _a = this.channelList; _i < _a.length; _i++) {
            var ch = _a[_i];
            if (ch.id == channelId)
                return ch;
        }
        return null;
    };
    SlackTeam.prototype.getChannelByName = function (channelName) {
        for (var _i = 0, _a = this.channelList; _i < _a.length; _i++) {
            var ch = _a[_i];
            if (ch.name == channelName)
                return ch;
        }
        return null;
    };
    SlackTeam.prototype.getCanonicalChannelName = function (str) {
        return str.replace(/\(.*\)/g, "");
    };
    SlackTeam.prototype.selectChannel = function (channelName) {
        var ch = this.getChannelByName(this.getCanonicalChannelName(channelName));
        if (!ch)
            return;
        this.currentConversation = ch;
        ch.updateContent();
    };
    SlackTeam.prototype.getUserName = function (userID) {
        for (var _i = 0, _a = this.userList; _i < _a.length; _i++) {
            var u = _a[_i];
            if (u.id === userID)
                return u.name;
        }
        return null;
    };
    SlackTeam.prototype.sendMessage = function (text) {
        if (!this.currentConversation)
            return;
        this.currentConversation.postMessage(text);
    };
    SlackTeam.prototype.postMessage = function (channelID, text) {
        var _this = this;
        var data = new Object();
        data.text = text;
        data.channel = channelID;
        data.as_user = true;
        this.isNotificationSuppressed = true;
        setTimeout(function () { _this.isNotificationSuppressed = false; }, 1000);
        // APIのchat.postMessageを使ってメッセージを送信する
        this.connection.reqAPI("chat.postMessage", data);
    };
    SlackTeam.prototype.updateContent = function (id, name_for_id) {
        var _this = this;
        var view = this.tui.view;
        var connection = this.connection;
        view.contentBox.setContent("");
        view.contentBox.setLabel(this.name + "/" + name_for_id);
        view.contentBox.log("Loading " + name_for_id + "(" + id + ") ...");
        connection.reqAPI('conversations.history', { channel: id }, function (data) {
            if (!data.ok) {
                view.contentBox.log("Failed: " + JSON.stringify(data) + "\n");
                return;
            }
            view.contentBox.setContent("");
            var messages = data.messages.map(function (e) {
                var head = (_this.getUserName(e.user) + "          ").substr(0, 10);
                return head + ":" + e.text;
            }).reverse();
            view.contentBox.log(messages.join("\n"));
        });
    };
    SlackTeam.prototype.openIM = function (user_id, name_for_id) {
        var _this = this;
        var view = this.tui.view;
        var connection = this.connection;
        view.contentBox.setContent("");
        view.contentBox.setLabel(this.name + "/@" + name_for_id);
        view.contentBox.log("Opening IM with @" + name_for_id + "(" + user_id + ") ...");
        connection.reqAPI('im.open', { user: user_id }, function (data) {
            if (!data.ok) {
                view.contentBox.log("Failed: " + JSON.stringify(data) + "\n");
                return;
            }
            var channel_id = data.channel.id;
            _this.currentConversation = new SlackDM(_this, channel_id, name_for_id);
            _this.currentConversation.updateContent();
        });
    };
    SlackTeam.SlackAPI = require('slackbotapi');
    return SlackTeam;
}());
var SlackTUIView = /** @class */ (function () {
    function SlackTUIView(tui) {
        var _this = this;
        this.tui = tui;
        var blessed = require('blessed');
        // Create a screen object.
        this.screen = blessed.screen({
            smartCSR: true,
            fullUnicode: true,
            dockBorders: true
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
                    }
                }
            },
            keys: true
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
                    }
                }
            },
            label: ' Channels ',
            keys: true
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
                    }
                }
            },
            label: ' Users ',
            keys: true
        });
        this.screen.append(this.userBox);
        this.contentBox = blessed.log({
            top: 0,
            left: '25%',
            width: '75%',
            height: '80%+1',
            content: "\n{green-bg}Welcome to SlackTUI!{/green-bg}\nUse {red-fg}Tab{/red-fg} key to move box focus.\nUse cursor keys to choose item.\n\t\t\t",
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
                    }
                }
            },
            keys: true,
            scrollable: true
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
                    }
                }
            },
            keys: true
        });
        this.screen.append(this.inputBox);
        this.inputBox.on('submit', function (text) {
            _this.inputBox.clearValue();
            _this.inputBox.cancel();
            _this.tui.sendMessage(text);
        });
        this.teamBox.on('select', function (el, selected) {
            var teamName = _this.tui.getCanonicalTeamName(el.getText());
            _this.tui.focusTeamByName(teamName);
        });
        this.channelBox.on('select', function (el, selected) {
            _this.tui.focusedTeam.selectChannel(el.getText());
        });
        this.userBox.on('select', function (el, selected) {
            var index = _this.userBox.getItemIndex(el);
            if (!_this.tui.focusedTeam)
                return;
            var u = _this.tui.focusedTeam.userList[index];
            if (u) {
                _this.tui.focusedTeam.openIM(u.id, u.name);
            }
        });
        this.screen.key(['C-c'], function (ch, key) {
            return process.exit(0);
        });
        this.screen.key(['t'], function (ch, key) {
            _this.teamBox.focus();
        });
        this.teamBox.key(['tab'], function (ch, key) {
            _this.channelBox.focus();
        });
        this.channelBox.key(['tab'], function (ch, key) {
            _this.userBox.focus();
        });
        this.userBox.key(['tab'], function (ch, key) {
            _this.inputBox.focus();
        });
        this.inputBox.key(['tab'], function (ch, key) {
            _this.contentBox.focus();
        });
        this.contentBox.key(['tab'], function (ch, key) {
            _this.teamBox.focus();
        });
        this.teamBox.focus();
        this.screen.render();
    }
    return SlackTUIView;
}());
var SlackTUI = /** @class */ (function () {
    function SlackTUI() {
        this.fs = require("fs");
        this.configFile = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"]
            + "/.teamlist.json";
        this.tokenList = [];
        this.teamDict = {};
        this.focusedTeam = null;
        this.view = new SlackTUIView(this);
        try {
            var fval = this.fs.readFileSync(this.configFile);
            this.tokenList = JSON.parse(fval);
        }
        catch (e) {
            this.view.contentBox.log("Error: failed to read " + this.configFile);
            this.view.contentBox.log("Please read https://github.com/hikalium/slack-tui/blob/master/README.md carefully.");
        }
        this.refreshTeamList();
    }
    SlackTUI.prototype.getCanonicalTeamName = function (str) {
        return str.replace(/\(.*\)/g, "");
    };
    SlackTUI.prototype.refreshTeamList = function () {
        var teamSelectorList = [];
        for (var _i = 0, _a = this.tokenList; _i < _a.length; _i++) {
            var t = _a[_i];
            teamSelectorList.push(t[1] + "(*)");
            var team = new SlackTeam(t, this);
            this.teamDict[t[1]] = team;
        }
        this.view.teamBox.setItems(teamSelectorList);
        this.view.screen.render();
    };
    SlackTUI.prototype.isTeamFocused = function (team) {
        return (this.focusedTeam === team);
    };
    SlackTUI.prototype.requestUpdateUserList = function (team) {
        if (!this.isTeamFocused(team))
            return;
        if (!team.userSelectorList)
            return;
        this.view.userBox.setItems(team.userSelectorList);
        this.view.screen.render();
    };
    SlackTUI.prototype.requestLogToContentBox = function (team, data) {
        if (!this.isTeamFocused(team))
            return;
        this.view.contentBox.log(data);
        //this.screen.render();
    };
    SlackTUI.prototype.requestClearContentBox = function (team) {
        if (!this.isTeamFocused(team))
            return;
        this.view.contentBox.setContent("");
    };
    SlackTUI.prototype.requestSetLabelOfContentBox = function (team, label) {
        if (!this.isTeamFocused(team))
            return;
        this.view.contentBox.setLabel(" " + label + " ");
        this.view.contentBox.render();
    };
    SlackTUI.prototype.focusTeamByName = function (teamName) {
        if (!this.teamDict[teamName])
            return;
        this.focusedTeam = this.teamDict[teamName];
        this.focusedTeam.updateChannelListView();
        this.requestUpdateUserList(this.focusedTeam);
    };
    SlackTUI.prototype.sendMessage = function (text) {
        if (!this.focusedTeam)
            return;
        this.focusedTeam.sendMessage(text);
    };
    return SlackTUI;
}());
var slackTUI = new SlackTUI();
var log = function (str) {
    slackTUI.view.contentBox.log(str);
};
