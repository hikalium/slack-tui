var blessed = require('blessed');
// Create a screen object.
var sc = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true
});
sc.title = 'slack-tui';
var teamBox = blessed.list({
    top: 0,
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
        hover: {
            bg: 'green'
        },
        selected: {
            bg: 'red'
        },
        focus: {
            bg: 'yellow'
        }
    },
    items: [
        "Teams:",
        "日本語？",
        "hensyu2017",
    ],
    keys: true
});
sc.append(teamBox);
var channelBox = blessed.list({
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
        hover: {
            bg: 'green'
        },
        selected: {
            bg: 'red'
        },
        focus: {
            bg: 'yellow'
        }
    },
    items: [
        "Channels:",
        "日本語？",
        "hensyu2017",
    ],
    keys: true
});
sc.append(channelBox);
var userBox = blessed.list({
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
        hover: {
            bg: 'green'
        },
        selected: {
            bg: 'red'
        },
        focus: {
            bg: 'yellow'
        }
    },
    items: [
        "Users:",
    ],
    keys: true
});
sc.append(userBox);
var contentBox = blessed.log({
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
        //fg: 'white',
        //bg: 'magenta',
        border: {
            fg: '#f0f0f0'
        }
    },
    keys: true,
    scrollable: true
});
sc.append(contentBox);
var inputBox = blessed.textbox({
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
        //bg: 'magenta',
        border: {
            fg: '#f0f0f0'
        },
        focus: {
            bg: 'yellow'
        }
    },
    keys: true
});
sc.append(inputBox);
inputBox.on('submit', function (text) {
    inputBox.clearValue();
    contentBox.log(text);
});
teamBox.on('select', function (el, selected) {
    contentBox.log(el.getText());
});
// Add a png icon to the box
/*
var icon = blessed.image({
    parent: contentBox,
    top: 0,
    left: 0,
    type: 'ansi',
    width: '50%',
    height: '25%',
    file: '2017_spring.png',
    search: false
});
*/
// If our box is clicked, change the content.
/*
box.on('click', function(data) {
    box.setContent('{center}Some different {red-fg}content{/red-fg}.{/center}');
    screen.render();
});

// If box is focused, handle `enter`/`return` and give us some more content.
box.key('enter', function(ch, key) {
    box.setContent('{right}Even different {black-fg}content{/black-fg}.{/right}\n');
    box.setLine(1, 'bar');
    box.insertLine(1, 'foo');
    screen.render();
});
*/
// Quit on Escape, q, or Control-C.
sc.key(['C-c'], function (ch, key) {
    return process.exit(0);
});
sc.key(['t'], function (ch, key) {
    teamBox.focus();
});
teamBox.key(['tab'], function (ch, key) {
    channelBox.focus();
});
channelBox.key(['tab'], function (ch, key) {
    inputBox.focus();
});
inputBox.key(['tab'], function (ch, key) {
    contentBox.focus();
});
contentBox.key(['tab'], function (ch, key) {
    teamBox.focus();
});
// Focus our element.
teamBox.focus();
// Render the screen.
sc.render();
var SlackTeam = (function () {
    function SlackTeam(config) {
        this.name = "";
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
            contentBox.log(JSON.stringify(data, null, " ").substr(0, 500));
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
            contentBox.log(JSON.stringify(data, null, " "));
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
        var channelSelectorList = ['Channels:'];
        for (var k in this.channelList) {
            var t = this.channelList[k];
            channelSelectorList.push("-" + t[0]);
        }
        channelBox.setItems(channelSelectorList);
        sc.render();
    };
    SlackTeam.prototype.refreshUserList = function () {
        var list = ['Users:'];
        for (var _i = 0, _a = this.userList; _i < _a.length; _i++) {
            var t = _a[_i];
            list.push("-" + t[0]);
        }
        userBox.setItems(list);
        sc.render();
    };
    SlackTeam.prototype.selectChannel = function (channelName) {
        var that = this;
        var chid = null;
        for (var _i = 0, _a = this.channelList; _i < _a.length; _i++) {
            var t = _a[_i];
            if (t[0] == channelName) {
                chid = t[1];
            }
        }
        if (!chid)
            return;
        this.connection.reqAPI('channels.history', { channel: chid }, function (data) {
            var messages = contentBox.log(JSON.stringify(data, null, " ").substr(0, 500));
            if (data.ok) {
                var messages = data.messages.map(function (e) {
                    return that.getUserName(e.user) + ":\t" + e.text;
                });
                var messages = messages.reverse();
                contentBox.log(messages.join("\n"));
            }
            //that.refreshChannelList();
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
var SlackTUI = (function () {
    function SlackTUI() {
        this.fs = require("fs");
        this.configFile = "teamlist.json";
        this.teamList = [];
        this.focusedTeam = null;
        try {
            var fval = this.fs.readFileSync(this.configFile);
            this.teamList = JSON.parse(fval);
        }
        catch (e) {
            contentBox.log("Error: failed to read " + this.configFile);
        }
        this.refreshTeamList();
    }
    SlackTUI.prototype.refreshTeamList = function () {
        var teamSelectorList = ['Teams:'];
        for (var k in this.teamList) {
            var t = this.teamList[k];
            teamSelectorList.push("-" + t[1]);
            this.focusedTeam = new SlackTeam(t);
        }
        teamBox.setItems(teamSelectorList);
        sc.render();
    };
    return SlackTUI;
}());
var slackTUI = new SlackTUI();
channelBox.on('select', function (el, selected) {
    //contentBox.log(el.getText());
    slackTUI.focusedTeam.selectChannel(el.getText().substr(1));
});
