/**
 * XYZ Sales Outreach - Sequence & Scheduling Engine
 * 
 * Compiles templates with personalization variables, generates follow-up queues,
 * processes outbox dispatches, and checks for replies to pause subsequent steps.
 */

import { OutreachDB } from './db.js';
import { GmailService } from './gmail-service.js';
import { GoogleAuth } from './google-auth.js';

export class SequenceEngine {
  /**
   * Compiles template tags (e.g. {{First Name}}) with prospect values.
   */
  static substitute(templateText, variables) {
    if (!templateText) return '';
    return templateText.replace(/\{\{([^}]+)\}\}/g, (match, tag) => {
      const key = tag.trim();
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  /**
   * Initializes a campaign by queuing Step 1 (the initial email) for all prospects.
   */
  static async initializeCampaign(campaignId) {
    const templates = await OutreachDB.getCampaignTemplates(campaignId);
    if (templates.length === 0) {
      throw new Error('This campaign has no email templates defined.');
    }

    const prospects = await OutreachDB.getCampaignProspects(campaignId);
    if (prospects.length === 0) {
      throw new Error('This campaign has no prospects loaded.');
    }

    // Step 1 template
    const step1Template = templates.find(t => t.step === 1);
    if (!step1Template) {
      throw new Error('Could not find Step 1 email template.');
    }

    const queueItems = [];
    const updatedProspects = [];

    for (const prospect of prospects) {
      // Only queue if prospect is in default 'queued' state
      if (prospect.status === 'queued' && prospect.currentStep === 0) {
        const id = 'q-' + Math.random().toString(36).substring(2, 9);
        
        // Compile subject and body for queue previewing
        const subject = this.substitute(step1Template.subjectTemplate, prospect.variables);
        const body = this.substitute(step1Template.bodyTemplate, prospect.variables);

        queueItems.push({
          id,
          campaignId,
          prospectId: prospect.id,
          step: 1,
          scheduledTime: Date.now(), // Send immediately
          status: 'pending',
          subject,
          body
        });

        prospect.currentStep = 1;
        updatedProspects.push(prospect);
      }
    }

    if (queueItems.length > 0) {
      await OutreachDB.addToQueue(queueItems);
      await OutreachDB.saveProspects(updatedProspects);
      
      await OutreachDB.addLog({
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        campaignId,
        type: 'info',
        timestamp: Date.now(),
        details: `Enqueued Step 1 emails for ${queueItems.length} prospects.`
      });
    }

    return queueItems.length;
  }

  /**
   * Processes all outstanding pending queue items across active campaigns.
   * Can be run on-demand or on tab load.
   * Runs callback for status updates per message.
   */
  static async processPendingQueue(onProgressCallback = null) {
    const pendingItems = await OutreachDB.getPendingQueue();
    const now = Date.now();
    
    // Filters items that are scheduled to be sent now or in the past
    const readyItems = pendingItems.filter(item => item.scheduledTime <= now);
    if (readyItems.length === 0) return 0;

    let successfulSends = 0;

    for (const item of readyItems) {
      // Re-verify that campaign is still active (not paused/completed)
      const campaign = await OutreachDB.getCampaign(item.campaignId);
      if (!campaign || campaign.status !== 'active') {
        continue; // Skip
      }

      const prospect = await OutreachDB.getProspect(item.prospectId);
      // Double check prospect state (don't send if they unsubscribed or replied in the meantime)
      if (!prospect || prospect.status === 'unsubscribed' || prospect.status === 'replied') {
        await OutreachDB.deleteQueueItem(item.id);
        continue;
      }

      try {
        if (onProgressCallback) {
          onProgressCallback(`Sending Step ${item.step} to ${prospect.email}...`);
        }

        // Send the actual email
        const sendResponse = await GmailService.sendEmail({
          to: prospect.email,
          subject: item.subject,
          body: item.body,
          threadId: prospect.threadId || null,
          lastMessageId: prospect.lastMessageId || null
        });

        // 1. Update queue item status
        item.status = 'sent';
        item.sentTime = Date.now();
        await OutreachDB.updateQueueItem(item);

        // 2. Update prospect progress
        prospect.status = 'sent';
        prospect.lastSentAt = Date.now();
        prospect.threadId = sendResponse.threadId;
        prospect.lastMessageId = sendResponse.messageId;
        await OutreachDB.updateProspect(prospect);

        // 3. Log the successful send
        await OutreachDB.addLog({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          campaignId: item.campaignId,
          prospectId: prospect.id,
          step: item.step,
          type: 'sent',
          timestamp: Date.now(),
          details: `Successfully sent Step ${item.step} follow-up to ${prospect.email}.`
        });

        // 4. Schedule NEXT step if available
        await this.scheduleNextStep(prospect, item.step, sendResponse.threadId, sendResponse.messageId);

        successfulSends++;

      } catch (err) {
        console.error(`Failed to send to ${prospect.email}:`, err);
        
        // Update queue item to failed
        item.status = 'failed';
        await OutreachDB.updateQueueItem(item);

        await OutreachDB.addLog({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          campaignId: item.campaignId,
          prospectId: prospect.id,
          step: item.step,
          type: 'error',
          timestamp: Date.now(),
          details: `Error sending Step ${item.step} to ${prospect.email}: ${err.message}`
        });
      }
    }

    return successfulSends;
  }

  /**
   * Looks up if there is a next template in the sequence, and queues it up.
   */
  static async scheduleNextStep(prospect, currentStep, threadId, lastMessageId) {
    const templates = await OutreachDB.getCampaignTemplates(prospect.campaignId);
    const nextStepNum = currentStep + 1;
    const nextTemplate = templates.find(t => t.step === nextStepNum);

    if (!nextTemplate) {
      // Sequence is finished for this prospect!
      // Keep prospect status as 'sent' or we can mark it 'completed' if no replies came
      return;
    }

    // Determine scheduled delay
    const delayDays = nextTemplate.delayDays || 1;
    let delayMs = delayDays * 24 * 60 * 60 * 1000;

    // Fast-scale testing in Mock Mode
    if (GoogleAuth.isMockMode()) {
      const mockScaleSetting = localStorage.getItem('XYZ_Outreach_MockTimeScale') || '10s';
      if (mockScaleSetting === '10s') {
        delayMs = 10000; // 1 day = 10 seconds
      } else if (mockScaleSetting === '1m') {
        delayMs = 60000; // 1 day = 1 minute
      }
    }

    const scheduledTime = Date.now() + delayMs;

    // Precompile next step templates for outbox visualization
    const subject = this.substitute(nextTemplate.subjectTemplate, prospect.variables);
    const body = this.substitute(nextTemplate.bodyTemplate, prospect.variables);

    const queueItem = {
      id: 'q-' + Math.random().toString(36).substring(2, 9),
      campaignId: prospect.campaignId,
      prospectId: prospect.id,
      step: nextStepNum,
      scheduledTime,
      status: 'pending',
      subject,
      body
    };

    await OutreachDB.addToQueue([queueItem]);
  }

  /**
   * Scans sent campaigns to detect prospect replies, then updates the database.
   */
  static async checkCampaignReplies(campaignId = null, onProgress = null) {
    const dbCampaigns = await OutreachDB.getAllCampaigns();
    // Filter active campaigns
    const activeCampaigns = dbCampaigns.filter(c => c.status === 'active' && (!campaignId || c.id === campaignId));

    let replyCount = 0;

    for (const campaign of activeCampaigns) {
      const prospects = await OutreachDB.getCampaignProspects(campaign.id);
      // We only check prospects that have been sent something, haven't replied, and haven't unsubscribed
      const activeProspects = prospects.filter(p => p.status === 'sent' && p.threadId);

      for (const prospect of activeProspects) {
        if (onProgress) {
          onProgress(`Checking thread for ${prospect.email}...`);
        }

        const replyCheck = await GmailService.checkThreadForReply(prospect.threadId, prospect.email);

        if (replyCheck.replied) {
          prospect.status = 'replied';
          prospect.repliedAt = replyCheck.replyTimestamp || Date.now();
          await OutreachDB.updateProspect(prospect);

          // 1. Cancel all future scheduled emails for this prospect
          await OutreachDB.cancelProspectPendingQueue(prospect.id);

          // 2. Log reply event
          await OutreachDB.addLog({
            id: 'log-' + Math.random().toString(36).substring(2, 9),
            campaignId: campaign.id,
            prospectId: prospect.id,
            step: prospect.currentStep,
            type: 'reply',
            timestamp: replyCheck.replyTimestamp || Date.now(),
            details: `Received reply from ${prospect.email}: "${replyCheck.replySnippet.substring(0, 80)}..."`
          });

          replyCount++;
        }
      }
    }

    return replyCount;
  }

  /**
   * Recompiles any pending scheduled queue items for a campaign when its templates are edited.
   */
  static async updatePendingQueueTemplates(campaignId) {
    const pendingItems = await OutreachDB.getPendingQueue();
    const campaignPending = pendingItems.filter(item => item.campaignId === campaignId);
    if (campaignPending.length === 0) return;

    const templates = await OutreachDB.getCampaignTemplates(campaignId);
    
    for (const item of campaignPending) {
      const template = templates.find(t => t.step === item.step);
      if (template) {
        const prospect = await OutreachDB.getProspect(item.prospectId);
        if (prospect) {
          item.subject = this.substitute(template.subjectTemplate, prospect.variables);
          item.body = this.substitute(template.bodyTemplate, prospect.variables);
          await OutreachDB.updateQueueItem(item);
        }
      }
    }
  }
}
