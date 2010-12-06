/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is buggerall.
 *
 * The Initial Developer of the Original Code is
 * Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *     Kevin Dangoor (kdangoor@mozilla.com)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */


define(function(require, exports, module) {

require("date");
require("time");

var getJSON = require("./util").getJSON;
var _ = require("underscore")._;

exports.Query = function(opts) {
    this._queryCount = 0;
    
    this.apiURL = opts.apiURL || 'https://api-dev.bugzilla.mozilla.org/latest/';
    this.viewURL = opts.viewURL || 'https://bugzilla.mozilla.org/show_bug.cgi?id=';
    this.linkTemplate = opts.linkTemplate ? _.template(opts.linkTemplate) : _.template('<a href="<%= viewURL %>" target="_blank"><%= bug.id %></a>');
    if (opts.query) {
        this.query = opts.query;
    }
    if (opts.bugid) {
        this.query = 'id=' + opts.bugid + '&' + this.query;
    }
    if (opts.fields) {
        this.query += "&include_fields=" + opts.fields;
    } else {
        this.query += "&include_fields=id,status,summary,cf_blocking_20,attachments,keywords,whiteboard,resolution,assigned_to,depends_on,last_change_time,creation_time";
    }
    
    this.includeHistory = opts.includeHistory;
    
    this.result = undefined;
};

exports.Query.prototype = {
    getJSON: function(url, callback) {
        this._queryCount++;
        getJSON(url, function(data) {
            if (!data) {
                this.error = 'No data returned... bad query, perhaps? Go to <a target="_blank" href="' + lastURL + '">' + url + '</a> to try out the query (opens in a new window).';
                this._callback(this);
                return;
            }
            callback(data);
            this._queryDone();
        }.bind(this));
    },
    
    run: function(callback) {
        var url = this.apiURL + 'bug?' + this.query;
        this._callback = callback;
        this.getJSON(url, this._bugResult.bind(this));
    },
    
    _bugResult: function(data) {
        var result = this.result = {};
        data.bugs.forEach(function(bugData) {
            var bug = result[bugData.id] = new exports.Bug(bugData);
            bug.link = this.linkTemplate({
                viewURL: this.viewURL + bug.id,
                bug: bug
            });
            if (this.includeHistory) {
                this._loadHistory(bug);
            }
        }.bind(this));
    },
    
    _queryDone: function() {
        this._queryCount--;
        if (!this._queryCount && this._callback) {
            this._callback(this);
        }
    },
    
    _loadHistory: function(bug) {
        var url = this.apiURL + "bug/" + bug.id + "/history";
        this.getJSON(url, bug._historyResult.bind(bug));
    }
};

exports.Attachment = function(data) {
    for (var key in data) {
        if (key == "creation_time") {
            this[key] = Date.parse(data[key]);
        } else {
            this[key] = data[key];
        }
    }
};

exports.Bug = function(data) {
    for (var key in data) {
        if (key == "attachments") {
            var attachments = this.attachments = {};
            data[key].forEach(function(attachment) {
                attachments[attachment.id] = new exports.Attachment(attachment);
            });
        } else if (key == "creation_time" || key == "last_change_time") {
            this[key] = Date.parse(data[key]);
        } else {
            this[key] = data[key];
        }
    }
};

exports.Bug.prototype = {
    _historyResult: function(data) {
        var history = this.history = [];
        data.history.forEach(function(changeset) {
            history.push(new exports.ChangeSet(this, changeset));
        }.bind(this));
    }
};

exports.ChangeSet = function(bug, data) {
    for (var key in data) {
        if (key == "change_time") {
            this[key] = Date.parse(data[key]);
        } else if (key == "changes") {
            var changes = this.changes = [];
            data["changes"].forEach(function(change) {
                changes.push(new exports.Change(bug, change));
            });
        } else {
            this[key] = data[key];
        }
    }
};

exports.Change = function(bug, data) {
    for (var key in data) {
        if (key == "attachment_id" && bug.attachments) {
            this.attachment = bug.attachments[data["attachment_id"]];
        } else {
            this[key] = data[key];
        }
    }
};

});