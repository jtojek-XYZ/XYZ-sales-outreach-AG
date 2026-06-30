/**
 * XYZ Sales Outreach - Google Authentication Service
 * 
 * Manages Google Identity Services (GIS) OAuth2 Implicit Flow
 * to acquire access tokens for Gmail & Sheets API. Supports Mock Mode
 * for offline dry-run testing.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

export class GoogleAuth {
  static tokenClient = null;
  static authCallback = null;

  static isMockMode() {
    return localStorage.getItem('XYZ_Outreach_MockMode') === 'true';
  }

  static setMockMode(val) {
    localStorage.setItem('XYZ_Outreach_MockMode', val ? 'true' : 'false');
    if (val) {
      // Clear real credentials on mock toggle to avoid confusion
      sessionStorage.removeItem('XYZ_Outreach_AccessToken');
      sessionStorage.removeItem('XYZ_Outreach_TokenExpires');
    }
  }

  static getClientId() {
    return localStorage.getItem('XYZ_Outreach_ClientID') || '';
  }

  static setClientId(clientId) {
    localStorage.setItem('XYZ_Outreach_ClientID', clientId.trim());
    this.tokenClient = null; // Reset client to force reinitialization
  }

  static async init(force = false) {
    if (this.isMockMode() && !force) {
      return true;
    }

    // Return true if already loaded, otherwise load script dynamically
    if (window.google?.accounts?.oauth2) {
      return true;
    }

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        resolve(true);
      };
      script.onerror = () => {
        console.warn('Failed to load GSI client library, fallback to Mock Mode suggested');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  static initializeTokenClient(onTokenReceived) {
    if (this.isMockMode()) return;

    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Client ID is missing. Please configure it in Settings.');
    }

    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          console.error('Google Sign-In Error:', tokenResponse);
          return;
        }

        if (tokenResponse.access_token) {
          const expiresAt = Date.now() + parseInt(tokenResponse.expires_in) * 1000;
          sessionStorage.setItem('XYZ_Outreach_AccessToken', tokenResponse.access_token);
          sessionStorage.setItem('XYZ_Outreach_TokenExpires', expiresAt.toString());
          
          this.fetchUserEmail(tokenResponse.access_token).then(email => {
            if (email) {
              localStorage.setItem('XYZ_Outreach_UserEmail', email);
            }
            if (onTokenReceived) onTokenReceived(tokenResponse.access_token);
            if (this.authCallback) this.authCallback(tokenResponse.access_token);
          });
        }
      }
    });
  }

  static async signIn(onSuccess) {
    if (this.isMockMode()) {
      sessionStorage.setItem('XYZ_Outreach_AccessToken', 'mock-access-token');
      sessionStorage.setItem('XYZ_Outreach_TokenExpires', (Date.now() + 3600 * 1000).toString());
      localStorage.setItem('XYZ_Outreach_UserEmail', 'agency_sales@xyz.com');
      if (onSuccess) onSuccess('mock-access-token');
      return;
    }

    this.authCallback = onSuccess;

    // Dynamically load Google script if it was skipped during startup Mock Mode
    if (!window.google?.accounts?.oauth2) {
      const loaded = await this.init(true);
      if (!loaded) {
        alert('Failed to load Google Sign-In script. Please disable ad-blockers or check your connection.');
        return;
      }
    }
    
    if (!this.tokenClient) {
      try {
        this.initializeTokenClient();
      } catch (err) {
        alert(err.message);
        return;
      }
    }

    // Request the token (triggers GIS popup)
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  static signOut() {
    sessionStorage.removeItem('XYZ_Outreach_AccessToken');
    sessionStorage.removeItem('XYZ_Outreach_TokenExpires');
    localStorage.removeItem('XYZ_Outreach_UserEmail');
    localStorage.removeItem('XYZ_Outreach_CachedSignature');
    
    const clientId = this.getClientId();
    const token = sessionStorage.getItem('XYZ_Outreach_AccessToken');
    if (window.google?.accounts?.oauth2 && token && !this.isMockMode()) {
      window.google.accounts.oauth2.revoke(token, () => {
        console.log('Access token revoked.');
      });
    }
  }

  static getToken() {
    if (this.isMockMode()) {
      return 'mock-access-token';
    }

    const token = sessionStorage.getItem('XYZ_Outreach_AccessToken');
    const expiresAt = sessionStorage.getItem('XYZ_Outreach_TokenExpires');

    if (!token || !expiresAt) return null;

    // Check if token is expired (with 1 min buffer)
    if (Date.now() > parseInt(expiresAt) - 60000) {
      sessionStorage.removeItem('XYZ_Outreach_AccessToken');
      sessionStorage.removeItem('XYZ_Outreach_TokenExpires');
      return null;
    }

    return token;
  }

  static isAuthorized() {
    return this.getToken() !== null;
  }

  static getUserEmail() {
    if (this.isMockMode()) {
      return 'agency_sales@xyz.com';
    }
    return localStorage.getItem('XYZ_Outreach_UserEmail') || '';
  }

  static async fetchUserEmail(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        return data.email;
      }
    } catch (e) {
      console.error('Error fetching user email from Google:', e);
    }
    return null;
  }
}
