/**
 * XYZ Sales Outreach - Gmail API Service
 * 
 * Formats RFC 822 MIME emails, encodes to base64url, dispatches messages
 * via Gmail API v1, fetches threads to detect replies, and implements
 * mock behaviors for dry-runs.
 */

import { GoogleAuth } from './google-auth.js';

export class GmailService {
  /**
   * Helper to encode strings to standard base64url format.
   */
  static base64urlEncode(str) {
    // btoa on UTF-8 friendly string
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Constructs an RFC 822 / MIME text formatted email string.
   */
  static buildMimeMessage({ to, subject, body, threadId, lastMessageId }) {
    const headers = {
      'To': to,
      'Subject': subject,
      'Content-Type': 'text/html; charset=utf-8',
      'MIME-Version': '1.0'
    };

    // If it's a follow-up, link SMTP headers properly for threading
    if (threadId && lastMessageId) {
      // Clean lastMessageId of any formatting
      const cleanMsgId = lastMessageId.includes('@') ? lastMessageId : `<${lastMessageId}@mail.gmail.com>`;
      headers['In-Reply-To'] = cleanMsgId;
      headers['References'] = cleanMsgId;
      
      // Standardize subject line for threads
      if (!subject.toLowerCase().startsWith('re:')) {
        headers['Subject'] = `Re: ${subject}`;
      }
    }

    let mime = '';
    for (const [key, value] of Object.entries(headers)) {
      mime += `${key}: ${value}\r\n`;
    }
    mime += '\r\n' + body;
    return mime;
  }

  /**
   * Sends an email via the Gmail API.
   * Returns `{ messageId: String, threadId: String }` on success.
   */
  static async sendEmail({ to, subject, body, threadId, lastMessageId }) {
    if (GoogleAuth.isMockMode()) {
      return this.sendMockEmail({ to, subject });
    }

    const token = GoogleAuth.getToken();
    if (!token) {
      throw new Error('Google OAuth Token not found. Please sign in first.');
    }

    const mimeString = this.buildMimeMessage({ to, subject, body, threadId, lastMessageId });
    const encodedMime = this.base64urlEncode(mimeString);

    const payload = {
      raw: encodedMime
    };

    if (threadId) {
      payload.threadId = threadId;
    }

    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to dispatch email through Gmail API.');
      }

      const data = await response.json();
      return {
        messageId: data.id,       // Gmail's internal message ID
        threadId: data.threadId   // Gmail's internal thread ID
      };
    } catch (error) {
      console.error('Gmail Service dispatch error:', error);
      throw error;
    }
  }

  /**
   * Checks a specific Gmail thread to determine if the prospect has replied.
   * Checks if any message in the thread is from a sender other than the user's email.
   * Returns `{ replied: boolean, replyTimestamp: number|null, replySnippet: string }`
   */
  static async checkThreadForReply(threadId, prospectEmail) {
    if (GoogleAuth.isMockMode()) {
      return this.checkMockThreadForReply(threadId, prospectEmail);
    }

    const token = GoogleAuth.getToken();
    if (!token) return { replied: false };

    try {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        console.warn(`Could not fetch thread ${threadId}:`, response.statusText);
        return { replied: false };
      }

      const data = await response.json();
      const messages = data.messages || [];

      if (messages.length <= 1) {
        return { replied: false };
      }

      const userEmail = GoogleAuth.getUserEmail().toLowerCase();
      const cleanProspectEmail = prospectEmail.toLowerCase();

      // Look at messages after our initial message
      for (let i = 1; i < messages.length; i++) {
        const msg = messages[i];
        const headers = msg.payload?.headers || [];
        const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
        
        const cleanFrom = fromHeader.toLowerCase();

        // If the message is from the prospect (and not us), it's a reply!
        if (cleanFrom.includes(cleanProspectEmail) && !cleanFrom.includes(userEmail)) {
          const dateHeader = headers.find(h => h.name.toLowerCase() === 'date')?.value;
          const timestamp = dateHeader ? new Date(dateHeader).getTime() : Date.now();
          return {
            replied: true,
            replyTimestamp: timestamp,
            replySnippet: msg.snippet || ''
          };
        }
      }

      return { replied: false };

    } catch (error) {
      console.error('Error checking thread replies:', error);
      return { replied: false };
    }
  }

  /**
   * Mock sending email.
   */
  static sendMockEmail({ to, subject }) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          messageId: 'mock-msg-' + Math.random().toString(36).substring(2, 9),
          threadId: 'mock-thd-' + Math.random().toString(36).substring(2, 9)
        });
      }, 500);
    });
  }

  /**
   * Mock reply checker.
   * Simulates replies randomly (25% chance) for demo visualization.
   */
  static checkMockThreadForReply(threadId, prospectEmail) {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Roll a dice: 25% chance of a mock reply
        const hasReplied = Math.random() < 0.25;
        if (hasReplied) {
          const snippets = [
            "Hi, thanks for reaching out. This sounds interesting, do you have time for a call this Thursday at 2 PM?",
            "Hello, please send over some case studies. We are indeed looking to revamp our Google Ads strategy.",
            "Thanks for writing. Can you share details on your pricing packages for performance marketing?",
            "Interesting pitch! I am adding our digital manager to this thread to coordinate a meeting."
          ];
          const randomSnippet = snippets[Math.floor(Math.random() * snippets.length)];
          resolve({
            replied: true,
            replyTimestamp: Date.now() - Math.floor(Math.random() * 3600 * 1000 * 5), // within last 5 hours
            replySnippet: randomSnippet
          });
        } else {
          resolve({ replied: false });
        }
      }, 300);
    });
  }
}
