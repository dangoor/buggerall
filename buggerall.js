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
  */  var Attachment, Bug, Change, ChangeSet, History, Query, Timeline, TimelineEntry, ajax, buggerall, getJSON, _serialize, _unserialize;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty;
  buggerall = this.buggerall = {};
  getJSON = $.getJSON;
  ajax = $.ajax;
  buggerall.VERSION = "0.3";
  buggerall.SERIALIZER_VERSION = 1;
  buggerall.Query = Query = (function() {
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
      this.computeLastCommentTime = opts.computeLastCommentTime;
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
        if (this.includeHistory) {
          this._loadHistory(bug);
        }
        _results.push(this.computeLastCommentTime ? this._getLatestComment(bug) : void 0);
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
          return bug._setHistoryFromQueryResult(data.history);
        });
      }
    };
    Query.prototype._getLatestComment = function(bug) {
      var url;
      url = this.apiURL + "bug/" + bug.id + "/comment?include_fields=creation_time,creator";
      return this.getJSON(url, function(data) {
        var lastComment;
        lastComment = data.comments[data.comments.length - 1];
        bug.lastCommentTime = Date.parse(lastComment.creation_time);
        return bug.lastCommentCreator = lastComment.creator.name;
      });
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
        _version: buggerall.SERIALIZER_VERSION
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
    Query.prototype.timeline = function(daysback) {
      if (daysback == null) {
        daysback = 30;
      }
      return new buggerall.Timeline(this.result, daysback);
    };
    return Query;
  })();
  buggerall.getCachedResult = function(url, callback) {
    return getJSON(url, function(data) {
      var key, result;
      console.log("Have the data... gonna run with it");
      if (data._version !== buggerall.SERIALIZER_VERSION) {
        throw new Error("bugger all! I don't know how to handle data from version: " + data._version + ". This is serializer version " + buggerall.SERIALIZER_VERSION);
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
  buggerall.Attachment = Attachment = (function() {
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
  buggerall.Bug = Bug = (function() {
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
        } else if (key === "history") {
          if (data[key] instanceof History) {
            this[key] = data[key];
          } else {
            this._setHistoryFromQueryResult(data[key]);
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
    Bug.prototype.loadHistory = function(url, callback) {
      return getJSON(url, __bind(function(data) {
        this.history = _unserialize(data);
        return callback(this);
      }, this));
    };
    Bug.prototype._setHistoryFromQueryResult = function(data) {
      var changeset, changesets, history, _i, _len, _results;
      history = this.history = new History(this.last_change_time);
      changesets = history.changesets;
      _results = [];
      for (_i = 0, _len = data.length; _i < _len; _i++) {
        changeset = data[_i];
        _results.push(changesets.push(new ChangeSet(this, changeset)));
      }
      return _results;
    };
    return Bug;
  })();
  buggerall.History = History = (function() {
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
  buggerall.ChangeSet = ChangeSet = (function() {
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
  buggerall.Change = Change = (function() {
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
    } else if (obj instanceof buggerall.Attachment) {
      objData._type = "Attachment";
    } else if (obj instanceof buggerall.ChangeSet) {
      objData._type = "ChangeSet";
    } else if (obj instanceof buggerall.Change) {
      objData._type = "Change";
    } else if (obj instanceof buggerall.History) {
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
      objData = new buggerall[obj._type]();
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
  buggerall.Timeline = Timeline = (function() {
    function Timeline(result, daysback) {
      var attachment, attachmentInfo, bug, bugId, change, changeset, cutoff, events, id, reviewFlag, reviewFlagResult, reviewRequestFlag, reviewRequestFlagResult, _i, _j, _len, _len2, _ref, _ref2, _ref3;
      events = this.events = [];
      cutoff = new Date().getTime() - 30 * 24 * 60 * 60 * 1000;
      reviewRequestFlag = /^review\?\((.*)\)$/;
      reviewFlag = /^review([+-])$/;
      for (bugId in result) {
        bug = result[bugId];
        if ((bug.creation_time != null) && bug.creation_time > cutoff) {
          events.push(new TimelineEntry(bugId, bug.creation_time, "newBug", ""));
        }
        if (bug.history != null) {
          _ref = bug.history.changesets;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            changeset = _ref[_i];
            if (changeset.change_time < cutoff) {
              continue;
            }
            _ref2 = changeset.changes;
            for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
              change = _ref2[_j];
              if (change.field_name === "whiteboard") {
                events.push(new TimelineEntry(bugId, changeset.change_time, "whiteboard", change.added));
              } else if (change.field_name === "summary") {
                events.push(new TimelineEntry(bugId, changeset.change_time, "summary", change.added));
              } else if (change.field_name === "flag") {
                attachmentInfo = change.attachment != null ? " for " + change.attachment.description : "";
                reviewRequestFlagResult = reviewRequestFlag.exec(change.added);
                reviewFlagResult = reviewFlag.exec(change.added);
                if (reviewRequestFlagResult) {
                  events.push(new TimelineEntry(bugId, changeset.change_time, "review", "r? " + reviewRequestFlagResult[1] + attachmentInfo));
                } else if (reviewFlagResult) {
                  events.push(new TimelineEntry(bugId, changeset.change_time, "review", "r" + reviewFlagResult[1] + attachmentInfo));
                }
              }
            }
          }
        }
        if (bug.attachments != null) {
          _ref3 = bug.attachments;
          for (id in _ref3) {
            attachment = _ref3[id];
            if (attachment.creation_time < cutoff || attachment.is_obsolete || !attachment.is_patch) {
              continue;
            }
            events.push(new TimelineEntry(bugId, attachment.creation_time, "newPatch", attachment.description));
          }
        }
        if ((bug.lastCommentTime != null) && bug.lastCommentTime > cutoff) {
          events.push(new TimelineEntry(bugId, bug.lastCommentTime, "newComment", "from " + bug.lastCommentCreator));
        }
      }
      this.sortEvents();
    }
    Timeline.prototype.sortEvents = function() {
      return this.events.sort(function(a, b) {
        if (a.when < b.when) {
          return 1;
        } else if (a.when > b.when) {
          return -1;
        }
        return 0;
      });
    };
    return Timeline;
  })();
  buggerall.TimelineEntry = TimelineEntry = (function() {
    function TimelineEntry(bugId, when, type, detail) {
      this.bugId = bugId;
      this.when = when;
      this.type = type;
      this.detail = detail;
    }
    return TimelineEntry;
  })();
}).call(this);
