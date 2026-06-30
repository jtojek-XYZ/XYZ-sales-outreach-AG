/**
 * XYZ Sales Outreach - Main App Controller & UI Orchestrator
 * 
 * Manages SPA state, view transitions, spreadsheet file/Sheets parsing,
 * timeline step composing, live variable substitution previewing, 
 * queue outbox operations, and Google authentication bindings.
 */

import { OutreachDB } from './db.js';
import { CSVParser } from './csv-parser.js';
import { GoogleAuth } from './google-auth.js';
import { GoogleSheetsService } from './sheets-service.js';
import { GmailService } from './gmail-service.js';
import { SequenceEngine } from './sequence-engine.js';

class OutreachApp {
  constructor() {
    this.state = {
      activeView: 'dashboard',
      selectedDashboardCampaignId: null, // Track selected campaign for dashboard stats
      currentCampaignDraft: {
        id: null,
        name: '',
        prospects: [],
        templates: [
          {
            step: 1,
            subjectTemplate: 'Introduction: Agency XYZ Services for {{Company}}',
            bodyTemplate: 'Hi {{First Name}},\n\nI hope you are doing well.\n\nI am reaching out from agency XYZ because we admire the work {{Company}} has been doing. We specialize in digital marketing solutions specifically for companies in your space.\n\nWould you have 10 minutes for a brief call next Tuesday to discuss how we can help scale your outreach?\n\nBest regards,\nThe XYZ Team',
            delayDays: 0
          }
        ]
      },
      selectedStepNum: 1,
      lastFocusedInput: null, // Keeps track of where to insert variable tokens
      selectedProspectIndex: 0
    };
  }

  async init() {
    console.log('XYZ Outreach App initializing...');
    
    // Initialize Auth & GSI script
    await GoogleAuth.init();
    this.updateAuthProfileUI();

    // Check query params or local db on load
    await this.renderDashboard();
    await this.updateQueueBadgeCount();

    // Setup All Event Listeners
    this.setupEventListeners();
  }

  // --- SPA VIEW TRANSITIONS ---
  switchView(viewName) {
    this.state.activeView = viewName;
    
    // Manage sidebar active class
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      }
    });

    // Toggle view visibility with transition
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active-view');
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      targetView.classList.add('active-view');
    }

    // Load data for specific view
    if (viewName === 'dashboard') {
      this.renderDashboard();
    } else if (viewName === 'queue') {
      this.renderQueueView();
    } else if (viewName === 'logs') {
      this.renderLogsView();
    }
  }

  // --- RENDER DASHBOARD ---
  async renderDashboard() {
    try {
      // 1. Fetch Stats
      const stats = await OutreachDB.getStats();
      document.getElementById('stat-total-prospects').textContent = stats.total;
      document.getElementById('stat-emails-sent').textContent = stats.sent;
      document.getElementById('stat-replies').textContent = stats.replied;
      document.getElementById('stat-reply-rate').textContent = `${stats.replyRate}%`;

      // 2. Fetch & Render Campaigns
      const campaigns = await OutreachDB.getAllCampaigns();
      const listContainer = document.getElementById('campaigns-list');
      listContainer.innerHTML = '';

      if (campaigns.length === 0) {
        listContainer.innerHTML = `
          <div class="no-data-placeholder" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <p>No outreach campaigns launched yet. Click 'Launch Campaign' to begin!</p>
          </div>
        `;
      } else {
        // Render rows
        for (const c of campaigns) {
          const campaignStats = await OutreachDB.getStats(c.id);
          const row = document.createElement('div');
          row.className = 'campaign-row';
          row.innerHTML = `
            <div class="campaign-row-details">
              <div class="campaign-row-name">${c.name}</div>
              <div class="campaign-row-meta">Launched ${new Date(c.createdAt).toLocaleDateString()} &bull; ${campaignStats.total} Prospects</div>
            </div>
            <div class="campaign-row-stats">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-right: 1.5rem;">
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">Active:</span>
                <label class="switch" title="Toggle Campaign Active State" style="margin: 0;">
                  <input type="checkbox" class="toggle-campaign-active" data-id="${c.id}" ${c.status === 'active' ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div style="text-align: right; min-width: 120px;">
                <div style="font-weight: 600; font-size: 0.95rem;">${campaignStats.sent} Sends &bull; ${campaignStats.replied} Replies</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${campaignStats.replyRate}% Reply Rate</div>
              </div>
              <button class="btn btn-secondary btn-edit-camp" data-id="${c.id}" style="padding: 0.4rem; border-radius: 8px; margin-right: 0.5rem;" title="Edit Campaign">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-blue);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn btn-secondary btn-delete-camp" data-id="${c.id}" style="padding: 0.4rem; border-radius: 8px;" title="Delete Campaign">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-crimson);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          `;
          listContainer.appendChild(row);
        }

        // Bind active toggle switches
        listContainer.querySelectorAll('.toggle-campaign-active').forEach(toggle => {
          toggle.addEventListener('change', async (e) => {
            const id = toggle.getAttribute('data-id');
            const isActive = e.target.checked;
            await this.toggleCampaignActive(id, isActive);
          });
        });

        // Bind edit campaign buttons
        listContainer.querySelectorAll('.btn-edit-camp').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            await this.editCampaign(id);
          });
        });

        // Bind delete campaign buttons
        listContainer.querySelectorAll('.btn-delete-camp').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            if (confirm('Are you absolutely sure you want to delete this campaign? This deletes all associated templates, scheduled outboxes, and log records. This cannot be undone.')) {
              await OutreachDB.deleteCampaign(id);
              await this.renderDashboard();
              await this.updateQueueBadgeCount();
            }
          });
        });
      }

      // Render the campaign-specific stats
      await this.renderCampaignSpecificStats();

      // Populate Campaign Selector dropdown on the dashboard
      const selector = document.getElementById('dashboard-campaign-selector');
      if (selector) {
        selector.innerHTML = '';
        console.log('[Selector Debug] Populating selector. Campaigns fetched from database:', campaigns);
        
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = campaigns.length === 0 ? 'No campaigns available' : 'None (Pause All)';
        defaultOpt.style.backgroundColor = '#121826';
        defaultOpt.style.color = '#f8fafc';
        selector.appendChild(defaultOpt);

        if (campaigns.length > 0) {
          campaigns.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            opt.style.backgroundColor = '#121826';
            opt.style.color = '#f8fafc';
            if (c.status === 'active') {
              opt.selected = true;
            }
            selector.appendChild(opt);
          });
        }
      }

      // 3. Fetch & Render Activity Stream (Max 15 items)
      const logs = await OutreachDB.getLogs();
      const activityContainer = document.getElementById('dashboard-activity-stream');
      activityContainer.innerHTML = '';

      if (logs.length === 0) {
        activityContainer.innerHTML = `
          <div class="no-data-placeholder" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <p>Waiting for sending queue execution or reply detections...</p>
          </div>
        `;
      } else {
        const recentLogs = logs.slice(0, 15);
        for (const log of recentLogs) {
          const node = document.createElement('div');
          node.className = 'activity-node';
          
          let iconClass = 'info';
          let svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
          
          if (log.type === 'sent') {
            iconClass = 'sent';
            svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          } else if (log.type === 'reply') {
            iconClass = 'reply';
            svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`;
          } else if (log.type === 'error') {
            iconClass = 'error';
            svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
          }

          node.innerHTML = `
            <div class="activity-icon-bullet ${iconClass}">
              ${svgIcon}
            </div>
            <div class="activity-node-content">
              <div class="activity-node-text">${log.details}</div>
              <div class="activity-node-time">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          `;
          activityContainer.appendChild(node);
        }
      }

    } catch (e) {
      console.error('Error rendering dashboard:', e);
    }
  }

  // --- TOGGLE CAMPAIGN ACTIVE STATE ---
  async toggleCampaignActive(campaignId, isActive) {
    try {
      if (isActive) {
        // Retrieve all campaigns
        const campaigns = await OutreachDB.getAllCampaigns();
        
        // Deactivate all other campaigns in IndexedDB
        for (const c of campaigns) {
          if (c.id !== campaignId && c.status === 'active') {
            await OutreachDB.updateCampaignStatus(c.id, 'paused');
            await OutreachDB.addLog({
              id: 'log-' + Math.random().toString(36).substring(2, 9),
              campaignId: c.id,
              type: 'info',
              timestamp: Date.now(),
              details: `Campaign paused automatically because another campaign was activated.`
            });
          }
        }
        
        // Activate current campaign
        await OutreachDB.updateCampaignStatus(campaignId, 'active');
        await OutreachDB.addLog({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          campaignId: campaignId,
          type: 'info',
          timestamp: Date.now(),
          details: `Campaign set to active.`
        });
        
        // Initialize sequence engine for this campaign (generate initial queues)
        try {
          await SequenceEngine.initializeCampaign(campaignId);
        } catch (engineErr) {
          console.warn('SequenceEngine initialization warning:', engineErr.message);
          await OutreachDB.addLog({
            id: 'log-' + Math.random().toString(36).substring(2, 9),
            campaignId: campaignId,
            type: 'info',
            timestamp: Date.now(),
            details: `Activated campaign, but sequence engine warned: ${engineErr.message}`
          });
        }
      } else {
        // Deactivate current campaign
        await OutreachDB.updateCampaignStatus(campaignId, 'paused');
        await OutreachDB.addLog({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          campaignId: campaignId,
          type: 'info',
          timestamp: Date.now(),
          details: `Campaign set to paused.`
        });
      }
      
      // Update the badge count & re-render dashboard
      await this.updateQueueBadgeCount();
      await this.renderDashboard();
    } catch (e) {
      console.error('Error toggling campaign status:', e);
      alert('Failed to toggle campaign active state.');
    }
  }

  // --- RENDER CAMPAIGN SPECIFIC STATS ---
  async renderCampaignSpecificStats() {
    try {
      const activeCampaignNameEl = document.getElementById('dashboard-active-campaign-name');
      const campaigns = await OutreachDB.getAllCampaigns();
      const activeCampaign = campaigns.find(c => c.status === 'active');

      if (!activeCampaign) {
        if (activeCampaignNameEl) {
          activeCampaignNameEl.textContent = 'No Active Campaign';
        }
        document.getElementById('stat-camp-total-prospects').textContent = '0';
        document.getElementById('stat-camp-emails-sent').textContent = '0';
        document.getElementById('stat-camp-replies').textContent = '0';
        document.getElementById('stat-camp-reply-rate').textContent = '0%';
        this.state.selectedDashboardCampaignId = null;

        // Hide prospects list when no campaign is active
        const directoryContainer = document.getElementById('campaign-prospects-container');
        if (directoryContainer) {
          directoryContainer.style.display = 'none';
        }
        return;
      }

      this.state.selectedDashboardCampaignId = activeCampaign.id;
      if (activeCampaignNameEl) {
        activeCampaignNameEl.textContent = activeCampaign.name;
      }

      const stats = await OutreachDB.getStats(activeCampaign.id);
      document.getElementById('stat-camp-total-prospects').textContent = stats.total;
      document.getElementById('stat-camp-emails-sent').textContent = stats.sent;
      document.getElementById('stat-camp-replies').textContent = stats.replied;
      document.getElementById('stat-camp-reply-rate').textContent = `${stats.replyRate}%`;

      // Render the directory table in real-time
      await this.renderCampaignProspectsDirectory(activeCampaign.id);
    } catch (e) {
      console.warn('Error rendering campaign specific stats:', e);
    }
  }

  /**
   * Renders the directory list table of prospects for the active campaign.
   */
  async renderCampaignProspectsDirectory(campaignId) {
    try {
      const container = document.getElementById('campaign-prospects-container');
      if (!container) return;

      const listContainer = document.getElementById('campaign-prospects-list');
      if (!listContainer) return;

      container.style.display = 'block'; // Show prospects panel

      const prospects = await OutreachDB.getCampaignProspects(campaignId);
      listContainer.innerHTML = '';

      if (prospects.length === 0) {
        listContainer.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.9rem;">
              No prospects in this campaign yet. Click 'Add Prospect' to manually add someone!
            </td>
          </tr>
        `;
        return;
      }

      prospects.forEach(p => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-glass)';
        tr.style.fontSize = '0.9rem';
        
        // Name resolution
        const name = p.variables['First Name'] || p.variables['Name'] || p.variables['Full Name'] || 'Recipient';
        
        // Render dynamic attributes mapped during CSV/Sheets load
        const customVars = [];
        Object.entries(p.variables).forEach(([k, v]) => {
          if (k !== 'First Name' && k !== 'Email' && k !== 'email' && v) {
            customVars.push(`<span style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-glass); border-radius: 4px; padding: 2px 6px; font-size: 0.75rem; margin-right: 4px; color: var(--text-secondary); display: inline-block;">${k}: ${v}</span>`);
          }
        });
        const varString = customVars.length > 0 ? customVars.join('') : '<span style="color: var(--text-muted); font-style: italic; font-size: 0.8rem;">None</span>';

        // Custom status badge
        let statusBadge = '';
        if (p.status === 'queued') {
          statusBadge = `<span style="background: rgba(138, 43, 226, 0.15); border: 1px solid rgba(138, 43, 226, 0.3); color: var(--accent-purple); padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Queued (Step ${p.currentStep})</span>`;
        } else if (p.status === 'sent') {
          statusBadge = `<span style="background: rgba(0, 150, 255, 0.15); border: 1px solid rgba(0, 150, 255, 0.3); color: var(--accent-blue); padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Sent (Step ${p.currentStep})</span>`;
        } else if (p.status === 'replied') {
          statusBadge = `<span style="background: rgba(0, 200, 150, 0.15); border: 1px solid rgba(0, 200, 150, 0.3); color: var(--accent-teal); padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Replied (Paused)</span>`;
        } else if (p.status === 'unsubscribed') {
          statusBadge = `<span style="background: rgba(255, 69, 0, 0.15); border: 1px solid rgba(255, 69, 0, 0.3); color: var(--accent-crimson); padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">Opted Out</span>`;
        }

        tr.innerHTML = `
          <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--text-primary);">${name}</td>
          <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${p.email}</td>
          <td style="padding: 0.75rem 1rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${varString}</td>
          <td style="padding: 0.75rem 1rem;">${statusBadge}</td>
          <td style="padding: 0.75rem 1rem; text-align: right;">
            <button class="btn btn-outline-danger btn-delete-prospect" data-id="${p.id}" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.25rem;" title="Delete Prospect">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete
            </button>
          </td>
        `;
        listContainer.appendChild(tr);
      });

      // Bind delete action buttons per prospect
      listContainer.querySelectorAll('.btn-delete-prospect').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Are you absolutely sure you want to delete this prospect? This cancels all outstanding dispatches in the Outbox for them and removes them from this campaign directory.')) {
            await OutreachDB.deleteProspect(id);
            // Refresh stats, outbox badge counts, and table rows
            await this.renderCampaignSpecificStats();
            await this.updateQueueBadgeCount();
            await this.renderQueueView();
          }
        });
      });
    } catch (e) {
      console.error('Error rendering prospects directory:', e);
    }
  }

  // --- OPEN EMAIL PREVIEW MODAL ---
  async openEmailPreviewModal(queueItemId) {
    try {
      const item = await OutreachDB.getQueueItem(queueItemId);
      if (!item) {
        alert('Email item not found.');
        return;
      }

      const campaign = await OutreachDB.getCampaign(item.campaignId);
      const prospect = await OutreachDB.getProspect(item.prospectId);

      // Hydrate Modal Info
      document.getElementById('preview-email-recipient').innerHTML = `
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-primary);">${prospect ? prospect.variables['First Name'] || 'Recipient' : 'Unknown Prospect'}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.15rem;">${prospect ? prospect.email : 'No Email'}</div>
      `;

      document.getElementById('preview-email-campaign').innerHTML = `
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-primary);">${campaign ? campaign.name : 'Unknown Campaign'}</div>
        <div style="font-size: 0.85rem; color: var(--accent-blue); margin-top: 0.15rem; font-weight: 600;">Sequence Step ${item.step}</div>
      `;

      const timeLabel = document.getElementById('preview-email-time-label');
      const timeVal = document.getElementById('preview-email-time');
      if (item.status === 'sent') {
        if (timeLabel) timeLabel.textContent = 'Actual Sent Time';
        if (timeVal) {
          timeVal.textContent = new Date(item.sentTime || item.scheduledTime).toLocaleString();
          timeVal.style.color = 'var(--accent-teal)';
        }
      } else {
        if (timeLabel) timeLabel.textContent = 'Scheduled Send Time';
        if (timeVal) {
          timeVal.textContent = new Date(item.scheduledTime).toLocaleString();
          timeVal.style.color = 'var(--accent-amber)';
        }
      }

      document.getElementById('preview-email-subject').textContent = item.subject;
      
      // Email body uses HTML templates, so we safely display it inside the preview panel
      document.getElementById('preview-email-body').innerHTML = item.body || '<p style="color: #64748b; font-style: italic;">No message body compiled.</p>';

      // Bind Send Now inside preview modal
      const btnSend = document.getElementById('btn-preview-send');
      const btnDelete = document.getElementById('btn-preview-delete');

      // Remove previous event listeners by cloning buttons
      const newBtnSend = btnSend.cloneNode(true);
      const newBtnDelete = btnDelete.cloneNode(true);
      btnSend.parentNode.replaceChild(newBtnSend, btnSend);
      btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);

      if (item.status === 'sent') {
        newBtnSend.style.display = 'none';
        newBtnDelete.style.display = 'none';
      } else {
        newBtnSend.style.display = 'inline-flex';
        newBtnDelete.style.display = 'inline-flex';
      }

      newBtnSend.addEventListener('click', async () => {
        // Force send item immediately
        item.scheduledTime = Date.now();
        await OutreachDB.updateQueueItem(item);
        
        newBtnSend.innerHTML = `
          <span style="display: flex; align-items: center; gap: 0.4rem;">
            <svg class="spinner" width="14" height="14" viewBox="0 0 50 50" style="animation: rotate 2s linear infinite; stroke: var(--text-primary); fill: none;"><circle cx="25" cy="25" r="20" stroke-width="5" stroke="currentColor" stroke-dasharray="1, 150" stroke-dashoffset="0" stroke-linecap="round"></circle></svg>
            Sending...
          </span>
        `;
        
        const processed = await SequenceEngine.processPendingQueue();
        if (processed > 0) {
          alert('Message successfully dispatched!');
        } else {
          alert('Failed to dispatch message. Check Gmail connection or Activity Logs.');
        }

        document.getElementById('email-preview-modal').classList.remove('open');
        await this.renderQueueView();
        await this.updateQueueBadgeCount();
      });

      newBtnDelete.addEventListener('click', async () => {
        if (confirm('Are you sure you want to cancel and delete this scheduled follow-up email?')) {
          await OutreachDB.deleteQueueItem(item.id);
          alert('Message successfully removed.');
          document.getElementById('email-preview-modal').classList.remove('open');
          await this.renderQueueView();
          await this.updateQueueBadgeCount();
        }
      });

      // Reveal Modal
      document.getElementById('email-preview-modal').classList.add('open');

    } catch (err) {
      console.error('Error opening email preview modal:', err);
      alert('Could not open email preview: ' + err.message);
    }
  }

  // --- INITIATE EDIT CAMPAIGN FLOW ---
  async editCampaign(campaignId) {
    try {
      const campaign = await OutreachDB.getCampaign(campaignId);
      if (!campaign) {
        alert('Campaign not found.');
        return;
      }

      const templates = await OutreachDB.getCampaignTemplates(campaignId);
      const prospects = await OutreachDB.getCampaignProspects(campaignId);

      // Hydrate campaign draft state
      this.state.currentCampaignDraft = {
        id: campaign.id,
        name: campaign.name,
        createdAt: campaign.createdAt,
        status: campaign.status,
        prospects: prospects,
        templates: templates
      };

      this.state.selectedStepNum = 1;

      // Populate Create View fields
      document.getElementById('campaign-name').value = campaign.name;
      
      // Update Title and Subtitle dynamically for Edit Mode
      document.getElementById('create-view-title').textContent = 'Edit Outreach Campaign';
      document.getElementById('create-view-desc').textContent = 'Modify your campaign details and fine-tune your templates.';

      // Hide file importer and show locked list warning
      document.getElementById('importer-card').style.display = 'none';
      document.getElementById('edit-mode-notice-card').style.display = 'block';

      // Prefill and display preview list
      this.renderRecipientPreviewGrid();

      // Show Create View first
      this.switchView('create');

    } catch (e) {
      alert(`Error loading campaign for edit: ${e.message}`);
      console.error(e);
    }
  }

  // --- OUTBOX QUEUE VIEW ---
  async renderQueueView() {
    try {
      // 1. RENDER SCHEDULED EMAILS (PENDING ITEMS)
      const pendingItems = await OutreachDB.getPendingQueue();
      const listContainer = document.getElementById('queue-table-body');
      listContainer.innerHTML = '';

      document.getElementById('queue-pending-indicator-count').textContent = pendingItems.length;

      if (pendingItems.length === 0) {
        listContainer.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
              All dispatch queues are completely clear!
            </td>
          </tr>
        `;
      } else {
        for (const item of pendingItems) {
          const campaign = await OutreachDB.getCampaign(item.campaignId);
          const prospect = await OutreachDB.getProspect(item.prospectId);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="dispatch-cell prospect">
                <span class="dispatch-cell-main">${prospect ? prospect.variables['First Name'] || 'Recipient' : 'Unknown'}</span>
                <span class="dispatch-cell-sub">${prospect ? prospect.email : 'Unknown'}</span>
              </div>
            </td>
            <td>${campaign ? campaign.name : 'Unknown Campaign'}</td>
            <td><span class="step-number" style="width:22px; height:22px; font-size:0.75rem;">${item.step}</span></td>
            <td class="btn-preview-trigger" data-id="${item.id}" style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; color: var(--text-primary); transition: color 0.2s;" onmouseover="this.style.color='var(--accent-blue)'" onmouseout="this.style.color='var(--text-primary)'" title="Click to Verify Email Content">${item.subject}</td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 0.5rem;">
                <button class="btn btn-secondary btn-preview-queue" data-id="${item.id}" style="padding: 0.4rem; border-radius: 8px;" title="Verify Email Content">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-blue);"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
                <button class="btn btn-secondary btn-send-now" data-id="${item.id}" style="padding: 0.4rem; border-radius: 8px;" title="Send Instantly">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
                <button class="btn btn-outline-danger btn-delete-queue" data-id="${item.id}" style="padding: 0.4rem; border-radius: 8px;" title="Remove from Outbox">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </td>
          `;
          listContainer.appendChild(tr);
        }

        // Bind Preview Queue actions (eye button and clickable subject line)
        listContainer.querySelectorAll('.btn-preview-queue, .btn-preview-trigger').forEach(el => {
          el.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = el.getAttribute('data-id');
            await this.openEmailPreviewModal(id);
          });
        });

        // Bind Send Now actions
        listContainer.querySelectorAll('.btn-send-now').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            // Execute single dispatch
            const pending = await OutreachDB.getPendingQueue();
            const item = pending.find(q => q.id === id);
            if (item) {
              // Override schedule time to make ready instantly
              item.scheduledTime = Date.now();
              await OutreachDB.updateQueueItem(item);
              
              btn.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted);">Sending...</span>`;
              
              const processed = await SequenceEngine.processPendingQueue();
              if (processed > 0) {
                alert('Message successfully sent!');
              } else {
                alert('Send dispatch failed. Check console or Activity Logs.');
              }
              await this.renderQueueView();
              await this.updateQueueBadgeCount();
            }
          });
        });

        // Bind Delete Queue Action
        listContainer.querySelectorAll('.btn-delete-queue').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (confirm('Cancel and remove this follow-up email from outbox?')) {
              await OutreachDB.deleteQueueItem(id);
              await this.renderQueueView();
              await this.updateQueueBadgeCount();
            }
          });
        });
      }

      // 2. RENDER SENT EMAILS (SENT LOGS)
      const sentItems = await OutreachDB.getSentQueue();
      const sentContainer = document.getElementById('sent-queue-table-body');
      if (sentContainer) {
        sentContainer.innerHTML = '';
        if (sentItems.length === 0) {
          sentContainer.innerHTML = `
            <tr>
              <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                No emails have been sent from this browser outbox yet.
              </td>
            </tr>
          `;
        } else {
          for (const item of sentItems) {
            const campaign = await OutreachDB.getCampaign(item.campaignId);
            const prospect = await OutreachDB.getProspect(item.prospectId);
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>
                <div class="dispatch-cell prospect">
                  <span class="dispatch-cell-main">${prospect ? prospect.variables['First Name'] || 'Recipient' : 'Unknown'}</span>
                  <span class="dispatch-cell-sub">${prospect ? prospect.email : 'Unknown'}</span>
                </div>
              </td>
              <td>${campaign ? campaign.name : 'Unknown Campaign'}</td>
              <td><span class="step-number" style="width:22px; height:22px; font-size:0.75rem; background: rgba(0, 200, 150, 0.15); border: 1px solid rgba(0, 200, 150, 0.3); color: var(--accent-teal);">${item.step}</span></td>
              <td style="color: var(--accent-teal); font-weight: 500;">${item.sentTime ? new Date(item.sentTime).toLocaleString() : 'N/A'}</td>
              <td class="btn-preview-trigger" data-id="${item.id}" style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; color: var(--text-primary); transition: color 0.2s;" onmouseover="this.style.color='var(--accent-blue)'" onmouseout="this.style.color='var(--text-primary)'" title="Click to Verify Email Content">${item.subject}</td>
              <td style="text-align: right;">
                <button class="btn btn-secondary btn-preview-queue" data-id="${item.id}" style="padding: 0.4rem; border-radius: 8px;" title="Verify Sent Email Content">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-blue);"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
              </td>
            `;
            sentContainer.appendChild(tr);
          }

          // Bind Preview actions for Sent table
          sentContainer.querySelectorAll('.btn-preview-queue, .btn-preview-trigger').forEach(el => {
            el.addEventListener('click', async (e) => {
              e.stopPropagation();
              const id = el.getAttribute('data-id');
              await this.openEmailPreviewModal(id);
            });
          });
        }
      }

    } catch (e) {
      console.error('Error rendering queue view:', e);
    }
  }

  // --- RENDER ACTIVITY LOGS ---
  async renderLogsView() {
    try {
      const logs = await OutreachDB.getLogs();
      const listContainer = document.getElementById('logs-table-body');
      listContainer.innerHTML = '';

      if (logs.length === 0) {
        listContainer.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-muted);">
              Activity log is clean and empty.
            </td>
          </tr>
        `;
        return;
      }

      for (const log of logs) {
        const campaign = log.campaignId ? await OutreachDB.getCampaign(log.campaignId) : null;
        const tr = document.createElement('tr');
        
        let typeBadge = `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">INFO</span>`;
        if (log.type === 'sent') {
          typeBadge = `<span class="badge" style="background: rgba(0, 150, 255, 0.15); color: var(--accent-blue);">SENT</span>`;
        } else if (log.type === 'reply') {
          typeBadge = `<span class="badge" style="background: rgba(0, 230, 160, 0.15); color: var(--accent-teal);">REPLY</span>`;
        } else if (log.type === 'error') {
          typeBadge = `<span class="badge" style="background: rgba(255, 50, 80, 0.15); color: var(--accent-crimson);">ERROR</span>`;
        }

        tr.innerHTML = `
          <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(log.timestamp).toLocaleString()}</td>
          <td>${typeBadge}</td>
          <td>${campaign ? campaign.name : '-'}</td>
          <td>${log.details}</td>
        `;
        listContainer.appendChild(tr);
      }
    } catch (e) {
      console.error('Error rendering logs view:', e);
    }
  }

  // --- CAMPAIGN RECIPIENT PREVIEW GRID ---
  renderRecipientPreviewGrid() {
    const prospects = this.state.currentCampaignDraft.prospects;
    const previewSection = document.getElementById('recipient-preview-section');
    const previewTable = document.getElementById('preview-table');

    if (prospects.length === 0) {
      previewSection.style.display = 'none';
      return;
    }

    previewSection.style.display = 'block';
    document.getElementById('preview-count').textContent = prospects.length;

    // Build Headers
    const headTr = document.createElement('tr');
    
    // Core Email Header
    const emailTh = document.createElement('th');
    emailTh.textContent = 'Email address (Target)';
    headTr.appendChild(emailTh);

    // Dynamic headers based on variables
    const sampleVars = Object.keys(prospects[0].variables);
    sampleVars.forEach(variable => {
      if (variable.toLowerCase() !== 'email') {
        const th = document.createElement('th');
        th.textContent = variable;
        headTr.appendChild(th);
      }
    });

    const thead = previewTable.querySelector('thead');
    thead.innerHTML = '';
    thead.appendChild(headTr);

    // Build Body Rows (Max 10 for performance)
    const tbody = previewTable.querySelector('tbody');
    tbody.innerHTML = '';

    const limitRows = prospects.slice(0, 10);
    limitRows.forEach(p => {
      const tr = document.createElement('tr');
      
      const emailTd = document.createElement('td');
      emailTd.textContent = p.email;
      emailTd.style.fontWeight = '600';
      tr.appendChild(emailTd);

      sampleVars.forEach(variable => {
        if (variable.toLowerCase() !== 'email') {
          const td = document.createElement('td');
          td.textContent = p.variables[variable] || '';
          tr.appendChild(td);
        }
      });
      tbody.appendChild(tr);
    });
  }

  // --- INITIALIZE EMAIL TEMPLATES EDITOR VIEW ---
  async initTemplatesEditor() {
    const prospects = this.state.currentCampaignDraft.prospects;
    if (prospects.length === 0) {
      alert('Please upload a prospect list before designing templates.');
      return;
    }

    // Fetch and cache the sender's actual Gmail signature
    try {
      this.state.userSignature = await GmailService.fetchGmailSignature();
    } catch (err) {
      console.warn('Could not fetch Gmail signature:', err);
      this.state.userSignature = '';
    }

    // Hydrate preview recipient selector dropdown
    const selector = document.getElementById('preview-recipient-selector');
    if (selector) {
      selector.innerHTML = '';
      prospects.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.style.backgroundColor = '#121826';
        opt.style.color = '#f8fafc';
        const name = p.variables['First Name'] || '';
        const comp = p.variables['Company'] || '';
        const details = [name, comp].filter(Boolean).join(' - ');
        opt.textContent = details ? `${details} <${p.email}>` : p.email;
        selector.appendChild(opt);
      });
      this.state.selectedProspectIndex = 0;
      selector.value = 0;
    }

    // Hydrate variable tokens chips
    const tokensContainer = document.getElementById('editor-variables-tokens');
    tokensContainer.innerHTML = '';

    // Collect all unique variable keys across all prospects for comprehensive chips
    const allVarKeysSet = new Set();
    prospects.forEach(p => {
      if (p.variables) {
        Object.keys(p.variables).forEach(k => {
          allVarKeysSet.add(k);
        });
      }
    });

    let firstProspectVars = Array.from(allVarKeysSet);

    // Guarantee 'First Name' token is available as a chip if we have any name-like column
    if (!firstProspectVars.includes('First Name')) {
      const hasNameColumn = firstProspectVars.some(v => {
        const lv = v.toLowerCase().replace(/[\s_-]/g, '');
        return lv === 'name' || lv === 'fullname' || lv === 'recipientname' || lv === 'prospectname';
      });
      if (hasNameColumn) {
        firstProspectVars.push('First Name');
      }
    }

    // Sort variable tokens alphabetically for premium visual consistency
    firstProspectVars.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    firstProspectVars.forEach(variable => {
      const chip = document.createElement('span');
      chip.className = 'token-chip';
      chip.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> ${variable}`;
      
      chip.addEventListener('click', () => {
        const targetInput = this.state.lastFocusedInput;
        if (!targetInput) {
          alert('Please click inside the Subject or Body text field to set where you want to insert the token.');
          return;
        }

        const start = targetInput.selectionStart;
        const end = targetInput.selectionEnd;
        const text = targetInput.value;
        const token = `{{${variable}}}`;
        
        targetInput.value = text.substring(0, start) + token + text.substring(end);
        
        // Put cursor right after inserted token
        targetInput.focus();
        targetInput.selectionStart = targetInput.selectionEnd = start + token.length;

        // Force a live preview recalculation
        this.updateLivePreview();
      });
      tokensContainer.appendChild(chip);
    });

    const isEdit = !!this.state.currentCampaignDraft.id;
    const editorTitle = document.getElementById('editor-campaign-title');
    const launchBtn = document.getElementById('btn-launch-campaign');
    
    if (isEdit) {
      editorTitle.textContent = 'Edit Outreach Sequence';
      launchBtn.textContent = 'Save Campaign Changes';
      launchBtn.classList.remove('pulse-glow');
    } else {
      editorTitle.textContent = 'Setup Outreach Sequence';
      launchBtn.textContent = 'Launch & Queue Outreach';
      launchBtn.classList.add('pulse-glow');
    }

    this.renderSequenceStepsTimeline();
    this.loadCurrentStepTemplate();
    this.switchView('editor');
  }

  // --- RENDER SEQUENCE STEPS ---
  renderSequenceStepsTimeline() {
    const container = document.getElementById('sequence-steps-timeline');
    container.innerHTML = '';

    const templates = this.state.currentCampaignDraft.templates;
    templates.forEach((t, index) => {
      const stepItem = document.createElement('div');
      stepItem.className = `step-item ${t.step === this.state.selectedStepNum ? 'active' : ''}`;
      
      stepItem.innerHTML = `
        <div class="step-item-left">
          <div class="step-number">${t.step}</div>
          <div class="step-details">
            <span class="step-title">${t.step === 1 ? 'Initial outreach' : `Follow-up sequence`}</span>
            <span class="step-delay">${t.step === 1 ? 'Sent immediately' : `Wait ${t.delayDays} days after previous step`}</span>
          </div>
        </div>
      `;

      stepItem.addEventListener('click', () => {
        this.saveInputsToCurrentTemplate();
        this.state.selectedStepNum = t.step;
        this.loadCurrentStepTemplate();
        this.renderSequenceStepsTimeline(); // Re-render highlights
      });

      container.appendChild(stepItem);
    });
  }

  // --- SYNC INPUT FIELDS FROM CURRENT STEP TEMPLATE ---
  loadCurrentStepTemplate() {
    const templates = this.state.currentCampaignDraft.templates;
    const current = templates.find(t => t.step === this.state.selectedStepNum);
    
    if (!current) return;

    // Load form fields
    document.getElementById('template-subject').value = current.subjectTemplate || '';
    document.getElementById('template-body').value = current.bodyTemplate || '';
    
    const delayDaysInput = document.getElementById('step-delay-days');
    delayDaysInput.value = current.delayDays || 0;

    // Show or hide delay config panel for Step 1 (Step 1 is always immediate)
    const delayCard = document.getElementById('step-settings-card');
    if (this.state.selectedStepNum === 1) {
      document.getElementById('delay-form-group').style.display = 'none';
      document.getElementById('btn-delete-sequence-step').style.display = 'none';
    } else {
      document.getElementById('delay-form-group').style.display = 'flex';
      document.getElementById('btn-delete-sequence-step').style.display = 'block';
    }

    this.updateLivePreview();
  }

  // --- SAVE FORM DATA INTO IN-MEMORY CAMPAIGN OBJECT ---
  saveInputsToCurrentTemplate() {
    const templates = this.state.currentCampaignDraft.templates;
    const current = templates.find(t => t.step === this.state.selectedStepNum);

    if (current) {
      current.subjectTemplate = document.getElementById('template-subject').value;
      current.bodyTemplate = document.getElementById('template-body').value;
      
      if (this.state.selectedStepNum > 1) {
        current.delayDays = parseInt(document.getElementById('step-delay-days').value) || 3;
      } else {
        current.delayDays = 0;
      }
    }
  }

  // --- EMAIL LIVE BROWSER PREVIEW COMPILER ---
  updateLivePreview() {
    const subjectRaw = document.getElementById('template-subject').value;
    const bodyRaw = document.getElementById('template-body').value;

    const prospects = this.state.currentCampaignDraft.prospects;
    const idx = this.state.selectedProspectIndex || 0;
    const sampleProspect = prospects[idx] || prospects[0] || { email: 'prospect_email@domain.com', variables: { 'Company': 'Example Corp', 'First Name': 'Recipient' } };

    // Substitute tokens
    const previewSubject = SequenceEngine.substitute(subjectRaw, sampleProspect.variables);
    
    // Compile plain text email body to rich HTML with paragraphs and user's authentic signature
    const previewBodyHtml = SequenceEngine.compileTemplateBody(bodyRaw, sampleProspect.variables, this.state.userSignature || '');

    document.getElementById('preview-recipient-email').textContent = sampleProspect.email;
    document.getElementById('preview-recipient-subject').textContent = previewSubject || '(No Subject Line)';
    
    const viewport = document.getElementById('live-email-preview');
    viewport.innerHTML = previewBodyHtml || `<span style="color:#a5b1c2; font-style:italic;">Draft email content is currently empty. Use the compose window above to start crafting your message!</span>`;
  }

  // --- SYSTEM LOGS REFRESH AND SYNC SIDEBAR COUNTER ---
  async updateQueueBadgeCount() {
    try {
      const list = await OutreachDB.getPendingQueue();
      const badge = document.getElementById('queue-badge-count');
      if (list.length > 0) {
        badge.textContent = list.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // --- REFRESH AUTH PROFILE AND SIGN-IN/OUT VIEWS ---
  updateAuthProfileUI() {
    const isMock = GoogleAuth.isMockMode();
    const authorized = GoogleAuth.isAuthorized();
    const email = GoogleAuth.getUserEmail();

    const authBtn = document.getElementById('google-auth-btn');
    const emailDisplay = document.getElementById('user-email-display');
    const avatar = document.getElementById('user-avatar');

    // Update settings toggle state
    document.getElementById('settings-mock-toggle').checked = isMock;
    
    if (isMock) {
      document.getElementById('settings-clientid-group').style.display = 'none';
      document.getElementById('settings-mockscale-group').style.display = 'block';
      
      emailDisplay.textContent = 'Mock Enterprise';
      avatar.textContent = 'M';
      avatar.style.background = 'var(--grad-primary)';
      authBtn.textContent = 'Mock Workspace Connected';
      authBtn.disabled = true;
    } else {
      document.getElementById('settings-clientid-group').style.display = 'block';
      document.getElementById('settings-mockscale-group').style.display = 'none';

      document.getElementById('settings-client-id').value = GoogleAuth.getClientId();

      if (authorized) {
        emailDisplay.textContent = email || 'Authenticated';
        avatar.textContent = email ? email[0].toUpperCase() : 'A';
        avatar.style.background = 'var(--accent-teal)';
        authBtn.textContent = 'Disconnect Google';
        authBtn.disabled = false;
      } else {
        emailDisplay.textContent = 'Not Signed In';
        avatar.textContent = '?';
        avatar.style.background = 'rgba(255,255,255,0.05)';
        authBtn.textContent = 'Sign In with Google';
        authBtn.disabled = false;
      }
    }
  }

  // --- SETUP EVENT LISTENERS ---
  setupEventListeners() {
    // 1. Sidebar Nav
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = item.getAttribute('data-view');
        if (view) {
          this.switchView(view);
        }
      });
    });

    // Back to dashboard
    document.querySelectorAll('.btn-back-dashboard').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView('dashboard');
      });
    });

    // Dashboard Campaign Selector pulldown
    const campSelector = document.getElementById('dashboard-campaign-selector');
    if (campSelector) {
      campSelector.addEventListener('change', async (e) => {
        const campaignId = e.target.value;
        if (campaignId) {
          await this.toggleCampaignActive(campaignId, true);
        } else {
          // If "None" is chosen, deactivate any currently active campaign
          const campaigns = await OutreachDB.getAllCampaigns();
          const activeCampaign = campaigns.find(c => c.status === 'active');
          if (activeCampaign) {
            await this.toggleCampaignActive(activeCampaign.id, false);
          } else {
            await this.renderDashboard();
          }
        }
      });
    }

    // --- ADD PROSPECT MODAL EVENTS ---
    const btnOpenAddProspect = document.getElementById('btn-add-prospect-modal');
    const modalAddProspect = document.getElementById('add-prospect-modal');
    const btnCloseAddProspect = document.getElementById('btn-close-add-prospect');
    const btnCancelAddProspect = document.getElementById('btn-cancel-add-prospect');
    const formAddProspect = document.getElementById('add-prospect-form');
    const dynamicVariablesContainer = document.getElementById('prospect-add-dynamic-variables');

    if (btnOpenAddProspect && modalAddProspect) {
      btnOpenAddProspect.addEventListener('click', async () => {
        const campaignId = this.state.selectedDashboardCampaignId;
        if (!campaignId) {
          alert('Please select an active campaign first.');
          return;
        }

        // Fetch existing prospects to discover custom variables
        const prospects = await OutreachDB.getCampaignProspects(campaignId);
        
        // Find all custom variable keys (excluding First Name and Email)
        const allKeys = new Set();
        prospects.forEach(p => {
          Object.keys(p.variables).forEach(k => {
            if (k !== 'First Name' && k !== 'Email' && k !== 'email') {
              allKeys.add(k);
            }
          });
        });

        // Clear dynamic container
        dynamicVariablesContainer.innerHTML = '';

        // If no prospects exist, we could add a default 'Company' field to be helpful
        if (allKeys.size === 0) {
          allKeys.add('Company');
        }

        // Render input fields for each custom variable!
        allKeys.forEach(key => {
          const div = document.createElement('div');
          div.className = 'form-group';
          div.style.margin = '0';
          div.innerHTML = `
            <label for="prospect-var-${key}" style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">${key}</label>
            <input type="text" id="prospect-var-${key}" data-key="${key}" class="input-glow" placeholder="e.g. Value for ${key}" style="width: 100%;">
          `;
          dynamicVariablesContainer.appendChild(div);
        });

        // Open modal
        modalAddProspect.classList.add('open');
        document.getElementById('prospect-add-email').focus();
      });
    }

    const closeAddProspectModal = () => {
      if (modalAddProspect) {
        modalAddProspect.classList.remove('open');
        if (formAddProspect) formAddProspect.reset();
        if (dynamicVariablesContainer) dynamicVariablesContainer.innerHTML = '';
      }
    };

    if (btnCloseAddProspect) {
      btnCloseAddProspect.addEventListener('click', closeAddProspectModal);
    }
    if (btnCancelAddProspect) {
      btnCancelAddProspect.addEventListener('click', closeAddProspectModal);
    }

    // Modal background click closes it
    if (modalAddProspect) {
      modalAddProspect.addEventListener('click', (e) => {
        if (e.target === modalAddProspect) {
          closeAddProspectModal();
        }
      });
    }

    if (formAddProspect) {
      formAddProspect.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const campaignId = this.state.selectedDashboardCampaignId;
        if (!campaignId) {
          alert('No campaign selected.');
          return;
        }

        const email = document.getElementById('prospect-add-email').value.trim();
        const firstName = document.getElementById('prospect-add-firstname').value.trim();

        if (!email) {
          alert('Email address is required.');
          return;
        }

        // Compile variables
        const variables = {
          'First Name': firstName || 'Recipient',
          'Email': email
        };

        // Collect dynamic variables
        dynamicVariablesContainer.querySelectorAll('input').forEach(input => {
          const key = input.getAttribute('data-key');
          const val = input.value.trim();
          variables[key] = val;
        });

        const newProspect = {
          id: 'p-' + Math.random().toString(36).substring(2, 9),
          campaignId: campaignId,
          email: email,
          variables: variables,
          status: 'queued',
          currentStep: 0
        };

        try {
          // Save prospect
          await OutreachDB.saveProspects([newProspect]);

          // Trigger sequence engine to initialize this new prospect and enqueue Step 1!
          await SequenceEngine.initializeCampaign(campaignId);

          // Close modal
          closeAddProspectModal();

          // Refresh UI
          await this.renderCampaignSpecificStats();
          await this.updateQueueBadgeCount();
          await this.renderQueueView(); // update Outbox Queue in real time!
          
          await OutreachDB.addLog({
            id: 'log-' + Math.random().toString(36).substring(2, 9),
            campaignId: campaignId,
            type: 'info',
            timestamp: Date.now(),
            details: `Manually added prospect ${email} and scheduled Step 1.`
          });
          
          // Re-render dashboard activity feed
          await this.renderDashboard();

        } catch (err) {
          console.error('Error adding prospect:', err);
          alert('Failed to add prospect: ' + err.message);
        }
      });
    }

    // 2. Google OAuth trigger
    document.getElementById('google-auth-btn').addEventListener('click', () => {
      if (GoogleAuth.isAuthorized()) {
        GoogleAuth.signOut();
        this.updateAuthProfileUI();
        this.renderDashboard();
      } else {
        // Validate Client ID before trying to sign in
        const isMock = GoogleAuth.isMockMode();
        const clientId = GoogleAuth.getClientId();
        
        if (!isMock && (!clientId || !clientId.endsWith('.apps.googleusercontent.com'))) {
          // Open Settings modal and display error
          document.getElementById('settings-modal').classList.add('open');
          const input = document.getElementById('settings-client-id');
          input.focus();
          input.style.borderColor = 'var(--accent-crimson)';
          
          const errorMsgDiv = document.getElementById('settings-error-msg');
          if (clientId && clientId.includes('@')) {
            errorMsgDiv.innerHTML = `⚠️ You tried to sign in using an email address (<strong>${clientId}</strong>) as your Google Client ID.<br>To connect your work email, you must first create a Google Cloud Project Client ID for your domain and paste it here. See instructions below!`;
          } else if (clientId) {
            errorMsgDiv.innerHTML = `⚠️ Google OAuth Client ID is invalid. It must end with <code style="font-family:monospace; color:var(--text-primary);">.apps.googleusercontent.com</code>.`;
          } else {
            errorMsgDiv.innerHTML = `⚠️ To log in with your work email, you must configure a Google Workspace OAuth Client ID first.<br><br><strong>Don't have a Client ID yet?</strong> Toggle <em>Offline Mock Mode</em> above to instantly test the app in 100% simulated mode!`;
          }
          errorMsgDiv.style.display = 'block';
          return;
        }

        GoogleAuth.signIn(() => {
          this.updateAuthProfileUI();
          this.renderDashboard();
        });
      }
    });

    // 3. Settings Modal triggers
    document.getElementById('nav-settings').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('open');
      // Clear errors on open
      document.getElementById('settings-client-id').style.borderColor = '';
      document.getElementById('settings-error-msg').style.display = 'none';
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('open');
    });

    // Close on overlay backdrop click
    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('settings-modal')) {
        document.getElementById('settings-modal').classList.remove('open');
      }
    });

    // 4. Email Preview Modal Close triggers
    document.getElementById('btn-close-email-preview').addEventListener('click', () => {
      document.getElementById('email-preview-modal').classList.remove('open');
    });

    document.getElementById('email-preview-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('email-preview-modal')) {
        document.getElementById('email-preview-modal').classList.remove('open');
      }
    });

    // Settings Toggle Mock Mode
    document.getElementById('settings-mock-toggle').addEventListener('change', (e) => {
      const isMock = e.target.checked;
      GoogleAuth.setMockMode(isMock);
      this.updateAuthProfileUI();
      // Clear errors on mock toggle
      document.getElementById('settings-client-id').style.borderColor = '';
      document.getElementById('settings-error-msg').style.display = 'none';
    });

    // Save Settings
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      const clientIdInput = document.getElementById('settings-client-id');
      const clientId = clientIdInput.value.trim();
      const scale = document.getElementById('settings-mock-scale').value;
      const isMock = document.getElementById('settings-mock-toggle').checked;
      const errorMsgDiv = document.getElementById('settings-error-msg');

      // Clear previous styles/errors
      clientIdInput.style.borderColor = '';
      errorMsgDiv.style.display = 'none';
      errorMsgDiv.textContent = '';

      if (!isMock) {
        if (!clientId) {
          clientIdInput.style.borderColor = 'var(--accent-crimson)';
          errorMsgDiv.textContent = '⚠️ Google Client ID cannot be empty. Please toggle "Offline Mock Mode" if you want to test the app without Google configuration.';
          errorMsgDiv.style.display = 'block';
          return;
        }

        // Specific warning if they enter an email address (very common mistake!)
        if (clientId.includes('@')) {
          clientIdInput.style.borderColor = 'var(--accent-crimson)';
          errorMsgDiv.innerHTML = `⚠️ <strong>${clientId}</strong> appears to be an email address.<br>A Google OAuth Client ID is a long unique string of letters and numbers ending with <code style="font-family:monospace; color:var(--text-primary);">.apps.googleusercontent.com</code>. Please see the expandable guide below!`;
          errorMsgDiv.style.display = 'block';
          return;
        }

        if (!clientId.endsWith('.apps.googleusercontent.com')) {
          clientIdInput.style.borderColor = 'var(--accent-crimson)';
          errorMsgDiv.innerHTML = `⚠️ Invalid format. A Google Client ID must end with <code style="font-family:monospace; color:var(--text-primary);">.apps.googleusercontent.com</code>.<br>Example: <code style="font-family:monospace; color:var(--text-primary); font-size:0.8rem;">123456789-abcdefg.apps.googleusercontent.com</code>`;
          errorMsgDiv.style.display = 'block';
          return;
        }
      }

      GoogleAuth.setClientId(clientId);
      localStorage.setItem('XYZ_Outreach_MockTimeScale', scale);

      document.getElementById('settings-modal').classList.remove('open');
      this.updateAuthProfileUI();
      this.renderDashboard();
      
      alert('Workspace configurations successfully saved!');
    });

    // Quick Launch Campaign
    document.getElementById('btn-quick-create').addEventListener('click', () => {
      // Clear previous inputs
      document.getElementById('campaign-name').value = '';
      document.getElementById('google-sheet-url').value = '';
      this.state.currentCampaignDraft.id = null;
      this.state.currentCampaignDraft.prospects = [];
      this.state.currentCampaignDraft.name = '';
      
      // Reset titles and importer state to default Create Mode
      document.getElementById('create-view-title').textContent = 'Create Outreach Campaign';
      document.getElementById('create-view-desc').textContent = 'Set a campaign name and upload your contact spreadsheet (CSV or Google Sheet).';
      document.getElementById('importer-card').style.display = 'grid';
      document.getElementById('edit-mode-notice-card').style.display = 'none';

      this.state.currentCampaignDraft.templates = [
        {
          step: 1,
          subjectTemplate: 'Introduction: Agency XYZ Services for {{Company}}',
          bodyTemplate: 'Hi {{First Name}},\n\nI hope you are doing well.\n\nI am reaching out from agency XYZ because we admire the work {{Company}} has been doing. We specialize in digital marketing solutions specifically for companies in your space.\n\nWould you have 10 minutes for a brief call next Tuesday to discuss how we can help scale your outreach?\n\nBest regards,\nThe XYZ Team',
          delayDays: 0
        }
      ];
      this.state.selectedStepNum = 1;

      document.getElementById('recipient-preview-section').style.display = 'none';
      this.switchView('create');
    });

    // 4. File Uploader Drag and Drop CSV
    const csvUploader = document.getElementById('csv-uploader');
    const fileInput = document.getElementById('csv-file-input');

    csvUploader.addEventListener('click', () => {
      fileInput.click();
    });

    csvUploader.addEventListener('dragover', (e) => {
      e.preventDefault();
      csvUploader.classList.add('dragover');
    });

    csvUploader.addEventListener('dragleave', () => {
      csvUploader.classList.remove('dragover');
    });

    csvUploader.addEventListener('drop', (e) => {
      e.preventDefault();
      csvUploader.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.processCSVFile(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        this.processCSVFile(files[0]);
      }
    });

    // Fetch Google Sheet rows
    document.getElementById('btn-load-sheet').addEventListener('click', async () => {
      const url = document.getElementById('google-sheet-url').value;
      if (!url) {
        alert('Please enter a Google Sheets URL or Spreadsheet ID.');
        return;
      }

      if (!GoogleAuth.isMockMode() && !GoogleAuth.isAuthorized()) {
        alert('Real API flows require Google Authentication. Please sign in with your enterprise account first!');
        return;
      }

      const loaderBtn = document.getElementById('btn-load-sheet');
      const originalText = loaderBtn.innerHTML;
      loaderBtn.innerHTML = `Fetching...`;
      loaderBtn.disabled = true;

      try {
        const prospects = await GoogleSheetsService.fetchSheetData(url);
        this.state.currentCampaignDraft.prospects = prospects;
        this.renderRecipientPreviewGrid();
        alert(`Successfully imported ${prospects.length} prospects from Google Sheets!`);
      } catch (err) {
        alert(`Error loading Google Sheet: ${err.message}`);
      } finally {
        loaderBtn.innerHTML = originalText;
        loaderBtn.disabled = false;
      }
    });

    // Create Navigation Continue
    document.getElementById('btn-to-editor').addEventListener('click', () => {
      const campName = document.getElementById('campaign-name').value.trim();
      if (!campName) {
        alert('Please provide a name for this outreach campaign.');
        return;
      }
      this.state.currentCampaignDraft.name = campName;
      this.initTemplatesEditor();
    });

    document.getElementById('btn-back-to-create').addEventListener('click', () => {
      this.switchView('create');
    });

    // 5. Template Composing Events
    const subjectInput = document.getElementById('template-subject');
    const bodyInput = document.getElementById('template-body');

    subjectInput.addEventListener('focus', () => { this.state.lastFocusedInput = subjectInput; });
    bodyInput.addEventListener('focus', () => { this.state.lastFocusedInput = bodyInput; });

    subjectInput.addEventListener('input', () => { this.updateLivePreview(); });
    bodyInput.addEventListener('input', () => { this.updateLivePreview(); });

    const previewSelector = document.getElementById('preview-recipient-selector');
    previewSelector.addEventListener('change', (e) => {
      this.state.selectedProspectIndex = parseInt(e.target.value) || 0;
      this.updateLivePreview();
    });

    // Step Delay inputs
    document.getElementById('step-delay-days').addEventListener('input', () => {
      this.saveInputsToCurrentTemplate();
      this.renderSequenceStepsTimeline();
    });

    // Add Step
    document.getElementById('btn-add-sequence-step').addEventListener('click', () => {
      this.saveInputsToCurrentTemplate();
      
      const templates = this.state.currentCampaignDraft.templates;
      const nextStep = templates.length + 1;
      
      templates.push({
        step: nextStep,
        subjectTemplate: `Re: ${templates[0].subjectTemplate}`,
        bodyTemplate: 'Hi {{First Name}},\n\nJust checking in on my previous email. I know you are busy scaling {{Company}}!\n\nDo you have any availability for a brief call next week?',
        delayDays: 3
      });

      this.state.selectedStepNum = nextStep;
      this.loadCurrentStepTemplate();
      this.renderSequenceStepsTimeline();
    });

    // Delete Step
    document.getElementById('btn-delete-sequence-step').addEventListener('click', () => {
      const active = this.state.selectedStepNum;
      if (active === 1) return; // Cannot delete first step

      if (confirm(`Delete Follow-up Step ${active}?`)) {
        let templates = this.state.currentCampaignDraft.templates;
        
        // Remove step
        templates = templates.filter(t => t.step !== active);
        
        // Renumber
        templates.forEach((t, i) => {
          t.step = i + 1;
        });

        this.state.currentCampaignDraft.templates = templates;
        
        // Select preceding step
        this.state.selectedStepNum = active - 1;
        this.loadCurrentStepTemplate();
        this.renderSequenceStepsTimeline();
      }
    });

    // Save Draft Inactive
    document.getElementById('btn-save-draft').addEventListener('click', async () => {
      this.saveInputsToCurrentTemplate();
      await this.launchCampaign('paused');
    });

    // Launch active campaign & generate outbox queue
    document.getElementById('btn-launch-campaign').addEventListener('click', async () => {
      this.saveInputsToCurrentTemplate();
      
      // Perform validation
      const campName = this.state.currentCampaignDraft.name;
      const templates = this.state.currentCampaignDraft.templates;
      
      for (const t of templates) {
        if (!t.subjectTemplate.trim() || !t.bodyTemplate.trim()) {
          alert(`Step ${t.step} email template subject or body cannot be blank.`);
          return;
        }
      }

      await this.launchCampaign('active');
    });

    // 6. Queue Review Process Sends & Scan Replies
    document.getElementById('btn-process-queue').addEventListener('click', async () => {
      if (!GoogleAuth.isMockMode() && !GoogleAuth.isAuthorized()) {
        alert('Real API flows require Google Authentication. Please sign in with your enterprise account first!');
        return;
      }

      const btn = document.getElementById('btn-process-queue');
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span class="pulse-glow" style="color:var(--accent-amber);">Dispatching Outbox...</span>`;
      btn.disabled = true;

      // HUD elements
      const hudModal = document.getElementById('queue-processing-modal');
      const hudTitle = document.getElementById('hud-title');
      const hudSubtitle = document.getElementById('hud-subtitle');
      const hudStatus = document.getElementById('hud-status');
      const hudName = document.getElementById('hud-recipient-name');
      const hudEmail = document.getElementById('hud-recipient-email');
      const hudProgressText = document.getElementById('hud-progress-text');
      const hudPercentText = document.getElementById('hud-percent-text');
      const hudProgressBar = document.getElementById('hud-progress-bar');
      const hudMiniLog = document.getElementById('hud-mini-log');
      const hudFlashingCard = document.getElementById('hud-flashing-card');

      let totalCount = 0;

      try {
        const sends = await SequenceEngine.processPendingQueue((data) => {
          if (!data) return;

          switch (data.status) {
            case 'start':
              totalCount = data.total;
              // Clear previous log, initialize HUD state
              hudMiniLog.innerHTML = `<div style="color: var(--text-muted); font-style: italic;">Initiating transmission pipeline for ${totalCount} follow-ups...</div>`;
              hudProgressBar.style.width = '0%';
              hudProgressText.textContent = `Preparing 1 of ${totalCount}`;
              hudPercentText.textContent = '0%';
              hudTitle.textContent = 'Outbox Dispatch Engine';
              hudSubtitle.textContent = 'ACTIVE TRANSMISSION';
              hudSubtitle.style.color = 'var(--accent-blue)';
              hudName.textContent = 'Preparing Pipeline';
              hudEmail.textContent = 'Checking pending dispatches';
              hudStatus.textContent = 'Connecting...';
              
              // Open modal
              hudModal.classList.add('open');
              break;

            case 'sending': {
              const name = data.prospect ? (data.prospect.variables['First Name'] || data.prospect.variables['Name'] || 'Recipient') : 'Recipient';
              const email = data.prospect ? data.prospect.email : 'Unknown';
              const idx = data.index + 1;

              hudName.textContent = name;
              hudEmail.textContent = email;
              hudStatus.textContent = 'Transmitting Message...';

              // Animate flash of Name card
              hudFlashingCard.classList.remove('hud-flash-active');
              void hudFlashingCard.offsetHeight; // trigger reflow
              hudFlashingCard.classList.add('hud-flash-active');

              const logDiv = document.createElement('div');
              logDiv.style.color = 'var(--text-muted)';
              logDiv.textContent = `> Launching Step ${data.item.step} for ${name} (${email})...`;
              hudMiniLog.appendChild(logDiv);
              hudMiniLog.scrollTop = hudMiniLog.scrollHeight;
              break;
            }

            case 'success': {
              const name = data.prospect ? (data.prospect.variables['First Name'] || data.prospect.variables['Name'] || 'Recipient') : 'Recipient';
              const idx = data.index + 1;
              const total = totalCount || 1;

              const pct = Math.round((idx / total) * 100);
              hudProgressBar.style.width = `${pct}%`;
              hudProgressText.textContent = `Sending ${idx} of ${total}`;
              hudPercentText.textContent = `${pct}%`;
              hudStatus.textContent = 'Message Delivered!';

              const logDiv = document.createElement('div');
              logDiv.style.color = 'var(--accent-teal)';
              logDiv.style.fontWeight = '600';
              logDiv.textContent = `✓ Dispatched Step ${data.item.step} successfully to ${name}!`;
              hudMiniLog.appendChild(logDiv);
              hudMiniLog.scrollTop = hudMiniLog.scrollHeight;
              break;
            }

            case 'failed': {
              const name = data.prospect ? (data.prospect.variables['First Name'] || data.prospect.variables['Name'] || 'Recipient') : 'Recipient';
              
              hudStatus.textContent = 'Delivery Failed';

              const logDiv = document.createElement('div');
              logDiv.style.color = 'var(--accent-danger)';
              logDiv.style.fontWeight = '600';
              logDiv.textContent = `✗ Failed sending Step ${data.item.step} to ${name}: ${data.error ? data.error.message : 'Unknown Error'}`;
              hudMiniLog.appendChild(logDiv);
              hudMiniLog.scrollTop = hudMiniLog.scrollHeight;
              break;
            }

            case 'complete': {
              hudTitle.textContent = 'Transmission Completed';
              hudSubtitle.textContent = 'OUTBOX PIPELINE CLEAN';
              hudSubtitle.style.color = 'var(--accent-teal)';
              hudName.textContent = 'All Sent!';
              hudEmail.textContent = `Dispatched ${data.successful} of ${data.total} emails.`;
              hudStatus.textContent = 'Idle';
              hudProgressBar.style.width = '100%';
              hudPercentText.textContent = '100%';

              const logDiv = document.createElement('div');
              logDiv.style.color = 'var(--accent-blue)';
              logDiv.style.fontWeight = 'bold';
              logDiv.style.marginTop = '0.5rem';
              logDiv.textContent = `--- Pipeline complete. Successfully dispatched ${data.successful} emails. ---`;
              hudMiniLog.appendChild(logDiv);
              hudMiniLog.scrollTop = hudMiniLog.scrollHeight;

              // Hide modal after completion
              setTimeout(() => {
                hudModal.classList.remove('open');
              }, 1200);
              break;
            }
          }
        });

        await this.renderQueueView();
        await this.updateQueueBadgeCount();
        await this.renderDashboard();
        
        if (sends > 0) {
          alert(`Successfully dispatched ${sends} outreach emails!`);
        } else {
          alert('No pending emails scheduled for delivery at this time.');
        }
      } catch (err) {
        alert(`Error running send queue: ${err.message}`);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        hudModal.classList.remove('open');
      }
    });

    document.getElementById('btn-scan-replies').addEventListener('click', async () => {
      if (!GoogleAuth.isMockMode() && !GoogleAuth.isAuthorized()) {
        alert('Real API flows require Google Authentication. Please sign in with your enterprise account first!');
        return;
      }

      const btn = document.getElementById('btn-scan-replies');
      const originalText = btn.innerHTML;
      btn.innerHTML = `Scanning...`;
      btn.disabled = true;

      try {
        const replies = await SequenceEngine.checkCampaignReplies();
        await this.renderQueueView();
        await this.updateQueueBadgeCount();
        await this.renderDashboard();
        
        alert(`Finished scanning! Detected ${replies} new incoming replies from active threads. Associated follow-ups have been paused.`);
      } catch (err) {
        alert(`Error scanning replies: ${err.message}`);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });

    // Clear log records
    document.getElementById('btn-clear-logs').addEventListener('click', async () => {
      if (confirm('Clear audit trails and logs permanently?')) {
        await OutreachDB.transaction('logs', 'readwrite', (tx) => {
          tx.objectStore('logs').clear();
        });
        await this.renderLogsView();
        await this.renderDashboard();
      }
    });
  }

  // --- LOCAL CSV FILE READING FLOW ---
  processCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      try {
        const prospects = CSVParser.parse(csvText);
        this.state.currentCampaignDraft.prospects = prospects;
        this.renderRecipientPreviewGrid();
        alert(`Parsed CSV file successfully! Loaded ${prospects.length} prospects.`);
      } catch (err) {
        alert(`Error parsing CSV: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // --- COMMIT CAMPAIGN OBJECT TO DATABASE AND SCHEDULE OUTBOX ---
  async launchCampaign(status = 'active') {
    const draft = this.state.currentCampaignDraft;
    const isEdit = !!draft.id;
    const campaignId = isEdit ? draft.id : 'camp-' + Math.random().toString(36).substring(2, 9);
    const createdAt = isEdit ? (draft.createdAt || Date.now()) : Date.now();

    const campaign = {
      id: campaignId,
      name: draft.name,
      createdAt: createdAt,
      status: status
    };

    const templates = draft.templates.map(t => ({
      ...t,
      id: t.id || 't-' + Math.random().toString(36).substring(2, 9),
      campaignId: campaignId
    }));

    try {
      if (status === 'active') {
        // Pause all other campaigns
        const campaigns = await OutreachDB.getAllCampaigns();
        for (const c of campaigns) {
          if (c.id !== campaignId && c.status === 'active') {
            await OutreachDB.updateCampaignStatus(c.id, 'paused');
            await OutreachDB.addLog({
              id: 'log-' + Math.random().toString(36).substring(2, 9),
              campaignId: c.id,
              type: 'info',
              timestamp: Date.now(),
              details: `Campaign paused automatically because another campaign was activated.`
            });
          }
        }
      }

      if (isEdit) {
        // 1. Overwrite Campaign record
        await OutreachDB.createCampaign(campaign);

        // 2. Delete and save updated templates
        await OutreachDB.deleteTemplatesForCampaign(campaignId);
        await OutreachDB.saveTemplates(templates);

        // 3. Recompile pending outbox messages
        await SequenceEngine.updatePendingQueueTemplates(campaignId);

        // 4. Add Edit Log
        await OutreachDB.addLog({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          campaignId: campaignId,
          type: 'info',
          timestamp: Date.now(),
          details: `Edited campaign "${draft.name}" details and email templates.`
        });

        // 5. If status is 'active', initialize campaign (safe call to start paused/new campaigns)
        if (status === 'active') {
          await SequenceEngine.initializeCampaign(campaignId);
        }

        await this.updateQueueBadgeCount();
        await this.renderDashboard();
        
        this.switchView('dashboard');
        
        alert(`Campaign "${draft.name}" updated successfully! Any pending follow-up emails in the outbox queue have been automatically updated.`);

      } else {
        // Create Mode
        const prospects = draft.prospects.map(p => ({
          ...p,
          id: 'p-' + Math.random().toString(36).substring(2, 9),
          campaignId: campaignId,
          currentStep: 0,
          status: 'queued'
        }));

        // 1. Commit Campaign configurations to database
        await OutreachDB.createCampaign(campaign);
        await OutreachDB.saveTemplates(templates);
        await OutreachDB.saveProspects(prospects);

        // 2. Add Initial Launch Log
        await OutreachDB.addLog({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          campaignId: campaignId,
          type: 'info',
          timestamp: Date.now(),
          details: `Created campaign "${draft.name}" with ${prospects.length} prospects and ${templates.length} sequence steps.`
        });

        // 3. Queue step 1 if launched in Active State
        if (status === 'active') {
          await SequenceEngine.initializeCampaign(campaignId);
        }

        await this.updateQueueBadgeCount();
        await this.renderDashboard();
        
        this.switchView('dashboard');
        
        alert(`Campaign "${draft.name}" launched successfully! Check the Outbox Queue to process sends.`);
      }

    } catch (err) {
      alert(`Database error saving campaign: ${err.message}`);
      console.error(err);
    }
  }
}

// Instantiate and bind to window onload
window.addEventListener('DOMContentLoaded', () => {
  const app = new OutreachApp();
  app.init().then(() => {
    window.outreachApp = app; // Expose for testing
  });
});
