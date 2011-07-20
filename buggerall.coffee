###
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
###

exports = @buggerall = {}

getJSON = $.getJSON
ajax = $.ajax

exports.VERSION = "0.2"
exports.SERIALIZER_VERSION = 1

exports.Query = class Query
    constructor: (opts) -> 
        @_queryCount = 0
        
        @apiURL = opts.apiURL || 'https://api-dev.bugzilla.mozilla.org/latest/'
        @viewURL = opts.viewURL || 'https://bugzilla.mozilla.org/show_bug.cgi?id='
        if opts.query
            @query = opts.query

        if opts.bugid
            @query = "id=#{opts.bugid}&#{@query}"
        
        if opts.fields
            @query += "&include_fields=" + opts.fields
        else
            @query += "&include_fields=id,status,summary,attachments,keywords,whiteboard,resolution,assigned_to,depends_on,last_change_time,creation_time"

        # URL to directory containing JSON files for history
        # buggerall will load history data from here first
        # and then from bugzilla if that data is out of date
        @historyCacheURL = opts.historyCacheURL
        @includeHistory = opts.includeHistory
        @whitespace = opts.whitespace
        
        @result = undefined

    getJSON: (url, callback) ->
        if typeof(url) != "object"
            params = 
                url: url
                success: callback
        else
            params = url
        
        params.dataType = 'json'
        success = params.success
        params.success = (data) =>
            if !data
                @.error = 'No data returned... bad query, perhaps? Go to <a target="_blank" href="' + lastURL + '">' + url + '</a> to try out the query (opens in a new window).'
                @_callback this
                @_queryDone()
                return

            success data
            @_queryDone()
        
        error = params.error
        params.error = () =>
            if error
                error()
            @_queryDone()
        
        @_queryCount++
        ajax params
    
    run: (callback) ->
        url = this.apiURL + 'bug?' + this.query
        @_callback = callback
        @getJSON url, @_bugResult
    
    _bugResult: (data) =>
        result = @result = {}
        for bugData in data.bugs
            bug = result[bugData.id] = new Bug(bugData)
            if @includeHistory
                @_loadHistory bug

    _queryDone: () =>
        @_queryCount--
        if not @_queryCount and @_callback
            @_callback @
    
    _loadHistory: (bug, forceBugzilla=false) ->
        if not forceBugzilla and @historyCacheURL
            url = @historyCacheURL + "#{bug.id}.json"
            @getJSON 
                url: url
                success: (data) ->
                    bug.history = _unserialize data
                error: () =>
                    @_loadHistory(bug, true)                
        else
            url = @apiURL + "bug/" + bug.id + "/history"
            @getJSON url, (data) ->
                history = bug.history = new History(bug.last_change_time)
                changesets = history.changesets
                for changeset in data.history
                    changesets.push new ChangeSet(bug, changeset)
    
    merge: (otherQ) ->
        for bugId of otherQ.result
            if not @result[bugId]
                @result[bugId] = otherQ.result[bugId]
    
    serialize: () ->
        data =
            _version: exports.SERIALIZER_VERSION

        for bugId of @result
            data[bugId] = _serialize @result[bugId]

        if @whitespace
            return JSON.stringify data, null, 1
        else
            return JSON.stringify data

exports.getCachedResult = (url, callback) ->
    getJSON(url, (data) ->
        console.log "Have the data... gonna run with it"
        if data._version != exports.SERIALIZER_VERSION
            throw new Error("bugger all! I don't know how to handle data from version: #{data._version}. This is serializer version #{exports.SERIALIZER_VERSION}")

        result = {}
        
        for key of data
            if key.substring(0, 1) == "_"
                continue

            result[key] = _unserialize data[key]
        
        callback result
    )

exports.Attachment = class Attachment
    constructor: (data) ->
        for key of data
            if key == "creation_time" or key == "last_change_time"
                @[key] = Date.parse data[key]
            else
                @[key] = data[key]

exports.Bug = class Bug
    constructor: (data) ->
        for key of data
            if key == "attachments"
                attachments = @attachments = {}
                for attachment in data[key]
                    attachments[attachment.id] = new Attachment(attachment)
            else if key == "creation_time" or key == "last_change_time"
                @[key] = Date.parse data[key]
            else
                @[key] = data[key]

    getLatestPatch: () ->
        if not @attachments
            return null
        
        latest = null
        for id, attachment of @attachments
            if not attachment.is_patch or attachment.is_obsolete
                continue

            if not latest or attachment.last_change_time > latest.last_change_time
                latest = attachment

        return latest
    
    loadHistory: (url, callback) ->
        getJSON url, (data) =>
            @history = _unserialize(data)
            callback(@)

exports.History = class History
    constructor: (lastChangeTime) ->
        @lastChangeTime = lastChangeTime
        @changesets = []
    
    serialize: (includeWhitespace=true) ->
        obj = _serialize @
        if includeWhitespace
            JSON.stringify obj, null, 1
        else
            JSON.stringify obj
    
exports.ChangeSet = class ChangeSet
    constructor: (bug, data) ->
        for key of data
            if key == "change_time"
                @[key] = Date.parse data[key]
            else if key == "changes"
                changes = this.changes = []
                for change in data["changes"]
                    changes.push new Change(bug, change)
            else
                @[key] = data[key]

exports.Change = class Change
    constructor: (bug, data) ->
        for key of data
            if key == "attachment_id" and bug.attachments
                @attachment = bug.attachments[data["attachment_id"]]
            else
                @[key] = data[key]

_serialize = (obj) ->
    if obj instanceof Array
        arrayData = []
        for item in obj
            if item instanceof Object
                arrayData.push _serialize(item)
            else
                arrayData.push item
        return arrayData;
    
    objData = {}

    if obj instanceof Bug
        objData._type = "Bug"
    else if obj instanceof exports.Attachment
        objData._type = "Attachment"
    else if obj instanceof exports.ChangeSet
        objData._type = "ChangeSet"
    else if obj instanceof exports.Change
        objData._type = "Change"
    else if obj instanceof exports.History
        objData._type = "History"
    else if obj instanceof Date
        objData._type = "Date"
        # we need to eliminate the .000 milliseconds because date.js doesn't
        # parse it properly, despite being the one generating it!
        objData.value = obj.toISOString().replace ".000", ""
        return objData

    for own key, item of obj
        # special handling for history, which is serialized
        # separately for speed's sake
        if objData._type == "Bug" and key == "history"
            continue
        if item instanceof Object
            objData[key] = _serialize item
        else
            objData[key] = item

    return objData

_unserialize = (obj) ->
    if obj instanceof Array
        arrayData = []
        for item in obj
            if item instanceof Object
                arrayData.push _unserialize(item)
            else
                arrayData.push(item)
        return arrayData
    
    if obj._type
        if obj._type == "Date"
            return Date.parse obj.value

        objData = new exports[obj._type]()
    else
        objData = {}
    
    for key of obj
        if key.substring(0, 1) == "_"
            continue

        item = obj[key]
        if item instanceof Object
            objData[key] = _unserialize item
        else
            objData[key] = obj[key]

    return objData

