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

var TimeSpan = require("time").TimeSpan;

var reviewFlag = /^review\?/;

exports.computeStats = function(bug) {
    var creation = bug.creation_time;
    var delta;
    
    var now = new Date();

    bug.history.forEach(function(changeset) {
        changeset.changes.forEach(function(change) {
            if (change.field_name == "cf_blocking_20") {
                if (change.added == "?") {
                    if (!bug.blockingRequestTime) {
                        bug.blockingRequestTime = changeset.change_time;
                    }
                } else if (change.added.substring(0,1) != "-") {
                    if (change.removed == "?") {
                        if (!bug.blockingRequestTime) {
                            bug.blockingRequestTime = creation;
                        }
                    }
                    if (!bug.blockingTime) {
                        bug.blockingTime = changeset.change_time;
                    }
                }
            } else if (change.field_name == "flag" && change.attachment) {
                var attachment = change.attachment;
                if (reviewFlag.exec(change.added)) {
                    if (!attachment.reviewRequestTime) {
                        attachment.reviewRequestTime = changeset.change_time;
                    }
                } else if (change.added == "review-" || change.added == "review+") {
                    if (!attachment.reviewTime) {
                        attachment.reviewTime = changeset.change_time;
                        if (!attachment.reviewRequestTime) {
                            attachment.reviewRequestTime = changeset.change_time;
                        }
                    }
                }
            }
        });
        
        bug.patchCount = 0;
        bug.rebases = 0;
        bug.timeWaiting = new TimeSpan(0);
        bug.timeBetweenPatches = new TimeSpan(0);
        if (bug.attachments) {
            var lastAttachmentForRebase;
            var lastReviewedAttachment;
            Object.keys(bug.attachments).forEach(function(attachmentId) {
                var attachment = bug.attachments[attachmentId];
                if (!attachment.is_patch || !attachment.reviewRequestTime) {
                    return;
                }
                bug.patchCount++;
                if (lastAttachmentForRebase && attachment.reviewRequestTime) {
                    bug.rebases++;
                    bug.timeWaiting = bug.timeWaiting.add(new TimeSpan(attachment.reviewRequestTime - lastAttachmentForRebase.reviewRequestTime));
                    lastAttachmentForRebase = null;
                }
                if (lastReviewedAttachment) {
                    bug.timeBetweenPatches = bug.timeBetweenPatches.add(new TimeSpan(attachment.creation_time - lastReviewedAttachment.reviewTime));
                    lastReviewedAttachment = null;
                }
                if (attachment.reviewRequestTime && !attachment.reviewTime) {
                    lastAttachmentForRebase = attachment;
                    return;
                }
                if (attachment.reviewRequestTime && attachment.reviewTime) {
                    bug.timeWaiting = bug.timeWaiting.add(new TimeSpan(attachment.reviewTime - attachment.reviewRequestTime));
                    lastReviewedAttachment = attachment;
                }
            });
            if (lastAttachmentForRebase) {
                bug.timeWaiting = bug.timeWaiting.add(new TimeSpan(now - lastAttachmentForRebase.reviewRequestTime));
                bug.rebases++;
            }
            
            if (lastReviewedAttachment) {
                bug.timeBetweenPatches = bug.timeBetweenPatches.add(new TimeSpan(now - lastReviewedAttachment.reviewTime));
            }
        }
        
        if (bug.blockingRequestTime) {
            if (!bug.blockingTime) {
                bug.blockingDelta = Infinity;
            } else {
                bug.blockingDelta = new TimeSpan(bug.blockingTime - bug.blockingRequestTime).getDays();
            }
        }
    });
};

});
