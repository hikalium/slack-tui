var SlackTeam = (function () {
    function SlackTeam(config, tui) {
        this.name = "";
        this.tui = tui;
        this.name = config[1];
        this.token = config[0];
        this.connection = new SlackTeam.SlackAPI({
            "token": config[0],
            'logging': false,
            'autoReconnect': true
        });
        this.connect();
        /*
        this.connection.reqAPI('groups.list', {token: config[0]}, function(data){
            contentBox.log(JSON.stringify(data, null, " ").substr(0, 500));
            if(data.ok){
                var groupList = data.groups.map(function(e){return e.name});
                contentBox.log(JSON.stringify(groupList, null, " ").substr(0, 100));
                contentBox.log(JSON.stringify(data.channels, null, " "));
            }
        });
         */
        var that = this;
        this.connection.reqAPI('channels.list', { token: this.token }, function (data) {
            //contentBox.log(JSON.stringify(data, null, " ").substr(0, 500));
            if (data.ok) {
                that.channelList = data.channels.map(function (e) { return [e.name, e.id]; });
                //contentBox.log(JSON.stringify(that.channelList, null, " ").substr(0, 100));
            }
            that.refreshChannelList();
        });
        this.connection.reqAPI('users.list', { token: this.token }, function (data) {
            if (data.ok) {
                that.userList = data.members.map(function (e) { return [e.name, e.id]; });
                //contentBox.log(JSON.stringify(that.userList, null, " ").substr(0, 100));
            }
            that.refreshUserList();
        });
    }
    SlackTeam.prototype.connect = function () {
        var that = this;
        this.connection.on('message', function (data) {
            // receive
            //contentBox.log(JSON.stringify(data, null, " "));
            /*
            if (!data || !data.text)
                return;
            if ("subtype" in data && data.subtype === "bot_message")
                return;
            var m = new DeborahMessage();
            m.text = data.text;
            m.senderName = that.getUsername(data);
            m.context = data.channel;
            m.driver = that;
            m.rawData = data;
        //
            if (m.senderName == that.bot.settings.profile.name)
                return;
        //
        //
            that.bot.receive(m);
             */
        });
    };
    SlackTeam.prototype.refreshChannelList = function () {
        this.channelSelectorList = [];
        for (var _i = 0, _a = this.channelList; _i < _a.length; _i++) {
            var t = _a[_i];
            this.channelSelectorList.push(t[0]);
        }
        this.tui.requestUpdateChannelList(this);
    };
    SlackTeam.prototype.refreshUserList = function () {
        this.userSelectorList = [];
        for (var _i = 0, _a = this.userList; _i < _a.length; _i++) {
            var t = _a[_i];
            this.userSelectorList.push(t[0]);
        }
        this.tui.requestUpdateUserList(this);
    };
    SlackTeam.prototype.selectChannel = function (channelName) {
        var _this = this;
        var chid = null;
        for (var _i = 0, _a = this.channelList; _i < _a.length; _i++) {
            var t = _a[_i];
            if (t[0] == channelName) {
                chid = t[1];
            }
        }
        if (!chid)
            return;
        this.tui.requestClearContentBox(this);
        this.tui.requestSetLabelOfContentBox(this, channelName);
        this.tui.requestLogToContentBox(this, "Loading...");
        this.connection.reqAPI('channels.history', { channel: chid }, function (data) {
            if (data.ok) {
                var messages = data.messages.map(function (e) {
                    return (_this.getUserName(e.user) + "          ").substr(0, 10) + ":" + e.text;
                }).reverse();
                _this.tui.requestLogToContentBox(_this, messages.join("\n"));
            }
        });
    };
    SlackTeam.prototype.getUserName = function (userID) {
        for (var _i = 0, _a = this.userList; _i < _a.length; _i++) {
            var u = _a[_i];
            if (u[1] === userID)
                return u[0];
        }
        return null;
    };
    return SlackTeam;
}());
SlackTeam.SlackAPI = require('slackbotapi');
var SlackTUIView = (function () {
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
            content: 'Hello {bold}world{/bold}!',
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
            _this.contentBox.log("send[" + text + "]");
        });
        this.teamBox.on('select', function (el, selected) {
            var teamName = el.getText();
            _this.tui.focusTeamByName(teamName);
        });
        this.channelBox.on('select', function (el, selected) {
            //contentBox.log(el.getText());
            _this.tui.focusedTeam.selectChannel(el.getText());
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
var SlackTUI = (function () {
    function SlackTUI() {
        this.fs = require("fs");
        this.configFile = "teamlist.json";
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
        }
        this.refreshTeamList();
    }
    SlackTUI.prototype.refreshTeamList = function () {
        var teamSelectorList = [];
        for (var _i = 0, _a = this.tokenList; _i < _a.length; _i++) {
            var t = _a[_i];
            teamSelectorList.push(t[1]);
            var team = new SlackTeam(t, this);
            this.teamDict[t[1]] = team;
        }
        this.view.teamBox.setItems(teamSelectorList);
        this.view.screen.render();
    };
    SlackTUI.prototype.requestUpdateChannelList = function (team) {
        if (this.focusedTeam !== team)
            return;
        this.view.channelBox.setItems(team.channelSelectorList);
        this.view.screen.render();
    };
    SlackTUI.prototype.requestUpdateUserList = function (team) {
        if (this.focusedTeam !== team)
            return;
        this.view.userBox.setItems(team.userSelectorList);
        this.view.screen.render();
    };
    SlackTUI.prototype.requestLogToContentBox = function (team, data) {
        if (this.focusedTeam !== team)
            return;
        this.view.contentBox.log(data);
        //this.screen.render();
    };
    SlackTUI.prototype.requestClearContentBox = function (team) {
        if (this.focusedTeam !== team)
            return;
        this.view.contentBox.setContent("");
    };
    SlackTUI.prototype.requestSetLabelOfContentBox = function (team, label) {
        if (this.focusedTeam !== team)
            return;
        this.view.contentBox.setLabel(" " + label + " ");
        this.view.contentBox.render();
    };
    SlackTUI.prototype.focusTeamByName = function (teamName) {
        if (this.teamDict[teamName]) {
            this.focusedTeam = this.teamDict[teamName];
        }
        this.requestUpdateChannelList(this.focusedTeam);
        this.requestUpdateUserList(this.focusedTeam);
    };
    return SlackTUI;
}());
var slackTUI = new SlackTUI();
