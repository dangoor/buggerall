(function() {
  /*
   * ***** BEGIN LICENSE BLOCK *****
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
   * ***** END LICENSE BLOCK ***** *
  */  var Attachment, Bug, Change, ChangeSet, History, Query, ajax, exports, getJSON, _serialize, _unserialize;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty;
  exports = this.buggerall = {};
  getJSON = $.getJSON;
  ajax = $.ajax;
  exports.VERSION = "0.2";
  exports.SERIALIZER_VERSION = 1;
  exports.Query = Query = (function() {
    function Query(opts) {
      this._queryDone = __bind(this._queryDone, this);;
      this._bugResult = __bind(this._bugResult, this);;      this._queryCount = 0;
      this.apiURL = opts.apiURL || 'https://api-dev.bugzilla.mozilla.org/latest/';
      this.viewURL = opts.viewURL || 'https://bugzilla.mozilla.org/show_bug.cgi?id=';
      if (opts.query) {
        this.query = opts.query;
      }
      if (opts.bugid) {
        this.query = "id=" + opts.bugid + "&" + this.query;
      }
      if (opts.fields) {
        this.query += "&include_fields=" + opts.fields;
      } else {
        this.query += "&include_fields=id,status,summary,attachments,keywords,whiteboard,resolution,assigned_to,depends_on,last_change_time,creation_time";
      }
      this.historyCacheURL = opts.historyCacheURL;
      this.includeHistory = opts.includeHistory;
      this.whitespace = opts.whitespace;
      this.result = void 0;
    }
    Query.prototype.getJSON = function(url, callback) {
      var error, params, success;
      if (typeof url !== "object") {
        params = {
          url: url,
          success: callback
        };
      } else {
        params = url;
      }
      params.dataType = 'json';
      success = params.success;
      params.success = __bind(function(data) {
        if (!data) {
          this.error = 'No data returned... bad query, perhaps? Go to <a target="_blank" href="' + lastURL + '">' + url + '</a> to try out the query (opens in a new window).';
          this._callback(this);
          this._queryDone();
          return;
        }
        success(data);
        return this._queryDone();
      }, this);
      error = params.error;
      params.error = __bind(function() {
        if (error) {
          error();
        }
        return this._queryDone();
      }, this);
      this._queryCount++;
      return ajax(params);
    };
    Query.prototype.run = function(callback) {
      var url;
      url = this.apiURL + 'bug?' + this.query;
      this._callback = callback;
      return this.getJSON(url, this._bugResult);
    };
    Query.prototype._bugResult = function(data) {
      var bug, bugData, result, _i, _len, _ref, _results;
      result = this.result = {};
      _ref = data.bugs;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        bugData = _ref[_i];
        bug = result[bugData.id] = new Bug(bugData);
        _results.push(this.includeHistory ? this._loadHistory(bug) : void 0);
      }
      return _results;
    };
    Query.prototype._queryDone = function() {
      this._queryCount--;
      if (!this._queryCount && this._callback) {
        return this._callback(this);
      }
    };
    Query.prototype._loadHistory = function(bug, forceBugzilla) {
      var url;
      if (forceBugzilla == null) {
        forceBugzilla = false;
      }
      if (!forceBugzilla && this.historyCacheURL) {
        url = this.historyCacheURL + ("" + bug.id + ".json");
        return this.getJSON({
          url: url,
          success: function(data) {
            return bug.history = _unserialize(data);
          },
          error: __bind(function() {
            return this._loadHistory(bug, true);
          }, this)
        });
      } else {
        url = this.apiURL + "bug/" + bug.id + "/history";
        return this.getJSON(url, function(data) {
          var changeset, changesets, history, _i, _len, _ref, _results;
          history = bug.history = new History(bug.last_change_time);
          changesets = history.changesets;
          _ref = data.history;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            changeset = _ref[_i];
            _results.push(changesets.push(new ChangeSet(bug, changeset)));
          }
          return _results;
        });
      }
    };
    Query.prototype.merge = function(otherQ) {
      var bugId, _results;
      _results = [];
      for (bugId in otherQ.result) {
        _results.push(!this.result[bugId] ? this.result[bugId] = otherQ.result[bugId] : void 0);
      }
      return _results;
    };
    Query.prototype.serialize = function() {
      var bugId, data;
      data = {
        _version: exports.SERIALIZER_VERSION
      };
      for (bugId in this.result) {
        data[bugId] = _serialize(this.result[bugId]);
      }
      if (this.whitespace) {
        return JSON.stringify(data, null, 1);
      } else {
        return JSON.stringify(data);
      }
    };
    return Query;
  })();
  exports.getCachedResult = function(url, callback) {
    return getJSON(url, function(data) {
      var key, result;
      console.log("Have the data... gonna run with it");
      if (data._version !== exports.SERIALIZER_VERSION) {
        throw new Error("bugger all! I don't know how to handle data from version: " + data._version + ". This is serializer version " + exports.SERIALIZER_VERSION);
      }
      result = {};
      for (key in data) {
        if (key.substring(0, 1) === "_") {
          continue;
        }
        result[key] = _unserialize(data[key]);
      }
      return callback(result);
    });
  };
  exports.Attachment = Attachment = (function() {
    function Attachment(data) {
      var key;
      for (key in data) {
        if (key === "creation_time" || key === "last_change_time") {
          this[key] = Date.parse(data[key]);
        } else {
          this[key] = data[key];
        }
      }
    }
    return Attachment;
  })();
  exports.Bug = Bug = (function() {
    function Bug(data) {
      var attachment, attachments, key, _i, _len, _ref;
      for (key in data) {
        if (key === "attachments") {
          attachments = this.attachments = {};
          _ref = data[key];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            attachment = _ref[_i];
            attachments[attachment.id] = new Attachment(attachment);
          }
        } else if (key === "creation_time" || key === "last_change_time") {
          this[key] = Date.parse(data[key]);
        } else {
          this[key] = data[key];
        }
      }
    }
    Bug.prototype.getLatestPatch = function() {
      var attachment, id, latest, _ref;
      if (!this.attachments) {
        return null;
      }
      latest = null;
      _ref = this.attachments;
      for (id in _ref) {
        attachment = _ref[id];
        if (!attachment.is_patch || attachment.is_obsolete) {
          continue;
        }
        if (!latest || attachment.last_change_time > latest.last_change_time) {
          latest = attachment;
        }
      }
      return latest;
    };
    return Bug;
  })();
  exports.History = History = (function() {
    function History(lastChangeTime) {
      this.lastChangeTime = lastChangeTime;
      this.changesets = [];
    }
    History.prototype.serialize = function(includeWhitespace) {
      var obj;
      if (includeWhitespace == null) {
        includeWhitespace = true;
      }
      obj = _serialize(this);
      if (includeWhitespace) {
        return JSON.stringify(obj, null, 1);
      } else {
        return JSON.stringify(obj);
      }
    };
    return History;
  })();
  exports.ChangeSet = ChangeSet = (function() {
    function ChangeSet(bug, data) {
      var change, changes, key, _i, _len, _ref;
      for (key in data) {
        if (key === "change_time") {
          this[key] = Date.parse(data[key]);
        } else if (key === "changes") {
          changes = this.changes = [];
          _ref = data["changes"];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            change = _ref[_i];
            changes.push(new Change(bug, change));
          }
        } else {
          this[key] = data[key];
        }
      }
    }
    return ChangeSet;
  })();
  exports.Change = Change = (function() {
    function Change(bug, data) {
      var key;
      for (key in data) {
        if (key === "attachment_id" && bug.attachments) {
          this.attachment = bug.attachments[data["attachment_id"]];
        } else {
          this[key] = data[key];
        }
      }
    }
    return Change;
  })();
  _serialize = function(obj) {
    var arrayData, item, key, objData, _i, _len;
    if (obj instanceof Array) {
      arrayData = [];
      for (_i = 0, _len = obj.length; _i < _len; _i++) {
        item = obj[_i];
        if (item instanceof Object) {
          arrayData.push(_serialize(item));
        } else {
          arrayData.push(item);
        }
      }
      return arrayData;
    }
    objData = {};
    if (obj instanceof Bug) {
      objData._type = "Bug";
    } else if (obj instanceof exports.Attachment) {
      objData._type = "Attachment";
    } else if (obj instanceof exports.ChangeSet) {
      objData._type = "ChangeSet";
    } else if (obj instanceof exports.Change) {
      objData._type = "Change";
    } else if (obj instanceof exports.History) {
      objData._type = "History";
    } else if (obj instanceof Date) {
      objData._type = "Date";
      objData.value = obj.toISOString().replace(".000", "");
      return objData;
    }
    for (key in obj) {
      if (!__hasProp.call(obj, key)) continue;
      item = obj[key];
      if (objData._type === "Bug" && key === "history") {
        continue;
      }
      if (item instanceof Object) {
        objData[key] = _serialize(item);
      } else {
        objData[key] = item;
      }
    }
    return objData;
  };
  _unserialize = function(obj) {
    var arrayData, item, key, objData, _i, _len;
    if (obj instanceof Array) {
      arrayData = [];
      for (_i = 0, _len = obj.length; _i < _len; _i++) {
        item = obj[_i];
        if (item instanceof Object) {
          arrayData.push(_unserialize(item));
        } else {
          arrayData.push(item);
        }
      }
      return arrayData;
    }
    if (obj._type) {
      if (obj._type === "Date") {
        return Date.parse(obj.value);
      }
      objData = new exports[obj._type]();
    } else {
      objData = {};
    }
    for (key in obj) {
      if (key.substring(0, 1) === "_") {
        continue;
      }
      item = obj[key];
      if (item instanceof Object) {
        objData[key] = _unserialize(item);
      } else {
        objData[key] = obj[key];
      }
    }
    return objData;
  };
}).call(this);
