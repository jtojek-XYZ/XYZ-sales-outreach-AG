/**
 * XYZ Sales Outreach - Browser Database Service (IndexedDB)
 * 
 * Provides client-side promise-based persistence for campaigns, templates,
 * prospects, the outreach queue, and activity logs.
 */

const DB_NAME = 'XYZ_Sales_Outreach_DB';
const DB_VERSION = 1;

export class OutreachDB {
  static open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // 1. Campaigns store
        if (!db.objectStoreNames.contains('campaigns')) {
          db.createObjectStore('campaigns', { keyPath: 'id' });
        }

        // 2. Templates store
        if (!db.objectStoreNames.contains('templates')) {
          const templatesStore = db.createObjectStore('templates', { keyPath: 'id' });
          templatesStore.createIndex('campaignId', 'campaignId', { unique: false });
        }

        // 3. Prospects store
        if (!db.objectStoreNames.contains('prospects')) {
          const prospectsStore = db.createObjectStore('prospects', { keyPath: 'id' });
          prospectsStore.createIndex('campaignId', 'campaignId', { unique: false });
          prospectsStore.createIndex('email', 'email', { unique: false });
          prospectsStore.createIndex('status', 'status', { unique: false });
        }

        // 4. Send Queue store
        if (!db.objectStoreNames.contains('queue')) {
          const queueStore = db.createObjectStore('queue', { keyPath: 'id' });
          queueStore.createIndex('campaignId', 'campaignId', { unique: false });
          queueStore.createIndex('prospectId', 'prospectId', { unique: false });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('scheduledTime', 'scheduledTime', { unique: false });
        }

        // 5. Activity Logs store
        if (!db.objectStoreNames.contains('logs')) {
          const logsStore = db.createObjectStore('logs', { keyPath: 'id' });
          logsStore.createIndex('campaignId', 'campaignId', { unique: false });
          logsStore.createIndex('type', 'type', { unique: false });
          logsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // --- GENERAL HELPER ---
  static async transaction(storeNames, mode, callback) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const result = callback(tx);
      
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- CAMPAIGNS ---
  static async createCampaign(campaign) {
    await this.transaction('campaigns', 'readwrite', (tx) => {
      tx.objectStore('campaigns').put(campaign);
    });
    return campaign;
  }

  static async getCampaign(id) {
    return this.transaction('campaigns', 'readonly', (tx) => {
      const req = tx.objectStore('campaigns').get(id);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result);
      });
    });
  }

  static async getAllCampaigns() {
    return this.transaction('campaigns', 'readonly', (tx) => {
      const req = tx.objectStore('campaigns').getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
      });
    });
  }

  static async updateCampaignStatus(id, status) {
    const campaign = await this.getCampaign(id);
    if (campaign) {
      campaign.status = status;
      await this.transaction('campaigns', 'readwrite', (tx) => {
        tx.objectStore('campaigns').put(campaign);
      });
    }
  }

  static async deleteCampaign(id) {
    // Delete campaign, and all associated templates, prospects, queue entries, logs
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['campaigns', 'templates', 'prospects', 'queue', 'logs'], 'readwrite');
      
      tx.objectStore('campaigns').delete(id);
      
      // We will perform multi-deletion in callback
      const deleteByIndex = (storeName, indexName, value) => {
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.openCursor(IDBKeyRange.only(value));
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      };

      deleteByIndex('templates', 'campaignId', id);
      deleteByIndex('prospects', 'campaignId', id);
      deleteByIndex('queue', 'campaignId', id);
      deleteByIndex('logs', 'campaignId', id);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- TEMPLATES ---
  static async saveTemplates(templates) {
    await this.transaction('templates', 'readwrite', (tx) => {
      const store = tx.objectStore('templates');
      templates.forEach(t => store.put(t));
    });
    return templates;
  }

  static async deleteTemplatesForCampaign(campaignId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('templates', 'readwrite');
      const store = tx.objectStore('templates');
      const index = store.index('campaignId');
      const request = index.openCursor(IDBKeyRange.only(campaignId));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getCampaignTemplates(campaignId) {
    return this.transaction('templates', 'readonly', (tx) => {
      const index = tx.objectStore('templates').index('campaignId');
      const req = index.getAll(IDBKeyRange.only(campaignId));
      return new Promise((resolve) => {
        req.onsuccess = () => {
          // Sort by step number
          const results = req.result || [];
          results.sort((a, b) => a.step - b.step);
          resolve(results);
        };
      });
    });
  }

  // --- PROSPECTS ---
  static async saveProspects(prospects) {
    await this.transaction('prospects', 'readwrite', (tx) => {
      const store = tx.objectStore('prospects');
      prospects.forEach(p => store.put(p));
    });
    return prospects;
  }

  static async updateProspect(prospect) {
    await this.transaction('prospects', 'readwrite', (tx) => {
      tx.objectStore('prospects').put(prospect);
    });
    return prospect;
  }

  static async deleteProspect(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['prospects', 'queue'], 'readwrite');
      
      // Delete prospect record
      tx.objectStore('prospects').delete(id);
      
      // Delete their pending queue items from send queue
      const queueStore = tx.objectStore('queue');
      const index = queueStore.index('prospectId');
      const request = index.openCursor(IDBKeyRange.only(id));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          queueStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getCampaignProspects(campaignId) {
    return this.transaction('prospects', 'readonly', (tx) => {
      const index = tx.objectStore('prospects').index('campaignId');
      const req = index.getAll(IDBKeyRange.only(campaignId));
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
      });
    });
  }

  static async getProspect(id) {
    return this.transaction('prospects', 'readonly', (tx) => {
      const req = tx.objectStore('prospects').get(id);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result);
      });
    });
  }

  // --- QUEUE ---
  static async addToQueue(queueItems) {
    await this.transaction('queue', 'readwrite', (tx) => {
      const store = tx.objectStore('queue');
      queueItems.forEach(item => store.put(item));
    });
    return queueItems;
  }

  static async updateQueueItem(item) {
    await this.transaction('queue', 'readwrite', (tx) => {
      tx.objectStore('queue').put(item);
    });
    return item;
  }

  static async getCampaignQueue(campaignId) {
    return this.transaction('queue', 'readonly', (tx) => {
      const store = tx.objectStore('queue');
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const list = req.result || [];
          resolve(list.filter(item => item.campaignId === campaignId));
        };
      });
    });
  }

  static async getPendingQueue(campaignId = null) {
    return this.transaction('queue', 'readonly', (tx) => {
      const store = tx.objectStore('queue');
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          let list = (req.result || []).filter(item => item.status === 'pending');
          if (campaignId) {
            list = list.filter(item => item.campaignId === campaignId);
          }
          // Sort chronologically
          list.sort((a, b) => (a.scheduledTime || 0) - (b.scheduledTime || 0));
          resolve(list);
        };
      });
    });
  }

  static async getSentQueue(campaignId = null) {
    return this.transaction('queue', 'readonly', (tx) => {
      const store = tx.objectStore('queue');
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          let list = (req.result || []).filter(item => item.status === 'sent');
          if (campaignId) {
            list = list.filter(item => item.campaignId === campaignId);
          }
          // Sort descending by sentTime (most recent first)
          list.sort((a, b) => (b.sentTime || 0) - (a.sentTime || 0));
          resolve(list);
        };
      });
    });
  }

  static async getQueueItem(id) {
    return this.transaction('queue', 'readonly', (tx) => {
      const req = tx.objectStore('queue').get(id);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result);
      });
    });
  }

  static async deleteQueueItem(id) {
    await this.transaction('queue', 'readwrite', (tx) => {
      tx.objectStore('queue').delete(id);
    });
  }

  // Clear outstanding pending items for a prospect (e.g. on reply or unsub)
  static async cancelProspectPendingQueue(prospectId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      const store = tx.objectStore('queue');
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.prospectId === prospectId && cursor.value.status === 'pending') {
            store.delete(cursor.primaryKey);
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- LOGS & ANALYTICS ---
  static async addLog(log) {
    await this.transaction('logs', 'readwrite', (tx) => {
      tx.objectStore('logs').put(log);
    });
    return log;
  }

  static async getLogs(campaignId = null) {
    return this.transaction('logs', 'readonly', (tx) => {
      const store = tx.objectStore('logs');
      let req;
      if (campaignId) {
        req = store.index('campaignId').getAll(IDBKeyRange.only(campaignId));
      } else {
        req = store.getAll();
      }
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => b.timestamp - a.timestamp); // reverse chronological
          resolve(list);
        };
      });
    });
  }

  // Get aggregated stats for either all campaigns or a specific campaign
  static async getStats(campaignId = null) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['prospects', 'queue'], 'readonly');
      
      let prospectsReq;
      if (campaignId) {
        prospectsReq = tx.objectStore('prospects').index('campaignId').getAll(IDBKeyRange.only(campaignId));
      } else {
        prospectsReq = tx.objectStore('prospects').getAll();
      }

      prospectsReq.onsuccess = () => {
        const prospects = prospectsReq.result || [];
        const total = prospects.length;
        const sent = prospects.filter(p => p.status === 'sent' || p.status === 'replied').length;
        const replied = prospects.filter(p => p.status === 'replied').length;
        const queued = prospects.filter(p => p.status === 'queued').length;
        const unsubscribed = prospects.filter(p => p.status === 'unsubscribed').length;

        resolve({
          total,
          sent,
          replied,
          queued,
          unsubscribed,
          replyRate: total > 0 && sent > 0 ? Math.round((replied / sent) * 100) : 0
        });
      };

      tx.onerror = () => reject(tx.error);
    });
  }
}
