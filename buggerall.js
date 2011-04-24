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


(function(win) {

var exports = win.buggerall = {};

var getJSON = $.getJSON;

exports.VERSION = "0.2";
exports.SERIALIZER_VERSION = 1;

exports.Query = function(opts) {
    this._queryCount = 0;
    
    this.apiURL = opts.apiURL || 'https://api-dev.bugzilla.mozilla.org/latest/';
    this.viewURL = opts.viewURL || 'https://bugzilla.mozilla.org/show_bug.cgi?id=';
    if (opts.query) {
        this.query = opts.query;
    }
    if (opts.bugid) {
        this.query = 'id=' + opts.bugid + '&' + this.query;
    }
    if (opts.fields) {
        this.query += "&include_fields=" + opts.fields;
    } else {
        this.query += "&include_fields=id,status,summary,attachments,keywords,whiteboard,resolution,assigned_to,depends_on,last_change_time,creation_time";
    }
    
    this.includeHistory = opts.includeHistory;
    this.whitespace = opts.whitespace;
    
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
    },
    
    serialize: function() {
        var data = {
            _version: exports.SERIALIZER_VERSION
        };
        Object.keys(this.result).forEach(function(bugId) {
            data[bugId] = _serialize(this.result[bugId]);
        }.bind(this));
        if (this.whitespace) {
            return JSON.stringify(data, null, 1);
        } else {
            return JSON.stringify(data);
        }
    }
};

exports.getCachedResult = function(url, callback) {
    getJSON(url, function(data) {
        if (data._version != exports.SERIALIZER_VERSION) {
            throw new Error("bugger all! I don't know how to handle data from version: " + data._version);
        }
        var result = {};
        
        Object.keys(data).forEach(function(key) {
            if (key.substring(0, 1) == "_") {
                return;
            }
            result[key] = _unserialize(data[key]);
        });
        callback(result);
    });
};

exports.Attachment = function(data) {
    for (var key in data) {
        if (key == "creation_time" || key == "last_change_time") {
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
    },
    
    getLatestPatch: function() {
        if (!this.attachments) {
            return null;
        }
        
        var latest = null;
        _.values(this.attachments).forEach(function(attachment) {
            if (!attachment.is_patch) {
                return;
            }
            if (!latest || attachment.last_change_time > latest.last_change_time) {
                latest = attachment;
            }
        });
        return latest;
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

var _serialize = function(obj) {
    if (obj instanceof Array) {
        var arrayData = [];
        obj.forEach(function(item) {
            if (item instanceof Object) {
                arrayData.push(_serialize(item));
            } else {
                arrayData.push(item);
            }
        });
        return arrayData;
    }
    
    var objData = {
    };
    if (obj instanceof exports.Bug) {
        objData._type = "Bug";
    } else if (obj instanceof exports.Attachment) {
        objData._type = "Attachment";
    } else if (obj instanceof exports.ChangeSet) {
        objData._type = "ChangeSet";
    } else if (obj instanceof exports.Change) {
        objData._type = "Change";
    } else if (obj instanceof Date) {
        objData._type = "Date";
        // we need to eliminate the .000 milliseconds because date.js doesn't
        // parse it properly, despite being the one generating it!
        objData.value = obj.toISOString().replace(".000", "");
        return objData;
    }
    Object.keys(obj).forEach(function(key) {
        var item = obj[key];
        if (item instanceof Object) {
            objData[key] = _serialize(item);
        } else {
            objData[key] = item;
        }
    });
    return objData;
};

var _unserialize = function(obj) {
    if (obj instanceof Array) {
        var arrayData = [];
        obj.forEach(function(item) {
            if (item instanceof Object) {
                arrayData.push(_unserialize(item));
            } else {
                arrayData.push(item);
            }
        });
        return arrayData;
    }
    
    var objData;
    
    if (obj._type) {
        if (obj._type == "Date") {
            return Date.parse(obj.value);
        }
        objData = new exports[obj._type]();
    } else {
        objData = {};
    }
    
    Object.keys(obj).forEach(function(key) {
        if (key.substring(0, 1) == "_") {
            return;
        }
        var item = obj[key];
        if (item instanceof Object) {
            objData[key] = _unserialize(item);
        } else {
            objData[key] = obj[key];
        }
    });
    return objData;
};

})(this);