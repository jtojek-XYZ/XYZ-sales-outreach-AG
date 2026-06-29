# ✉️ XYZ Sales Outreach Hub - User Guide

Welcome to your **Sales Outreach Command Center**! This tool lets you launch highly personalized, multi-step email outreach campaigns directly from your web browser using your active Google Account. 

All your campaigns, templates, and leads are saved securely in your browser's local database. No third-party servers see your data, ensuring total privacy.

---

## 📸 Overview & Quick Navigation
Here is how your outreach command center looks. Click through the sidebar to navigate:

* **Dashboard:** See your overall metrics, campaign statuses, and recent activity at a glance.
  ![Dashboard Preview](assets/dashboard.png)
* **Create Campaign:** Import your target prospects from local files or Google Sheets.
  ![Create Campaign Preview](assets/create_campaign.png)
* **Customize Email Sequence:** Craft multi-step follow-ups, insert variables, and preview drafts.
  ![Customize Email Sequence Preview](assets/campaign_customize_email.png)
* **Outbox Queue:** Review, edit, and dispatch pending scheduled emails.
  ![Outbox Queue Preview](assets/outbox_queue.png)
* **Activity Logs:** View detailed logs of all sent emails, imports, and received replies.
  ![Activity Logs Preview](assets/activity_logs.png)
* **Settings:** Connect your Google Account credentials and toggle Mock Mode for testing.
  ![Settings Preview](assets/settings.png)

---

## 🛠️ Step-by-Step Outreach Playbook

To launch your first personalized campaign, simply follow these 4 steps:

### Step 1: Prepare Your Google Sheets Lead List
Before opening the app, you need to create a Google Sheet containing your target clients.

1. **Set Up Your Column Headers:**
   Create a Google Sheet where the first row contains your column headers. You can use any column headers you like, but here is a standard example:
   
   | Email | First Name | Last Name | Company | ServiceOfInterest |
   | :--- | :--- | :--- | :--- | :--- |
   | jim@company.com | Jim | Halpert | Dunder Mifflin | Paper Supply |
   | pam@agency.com | Pam | Beesly | Scranton Design | Website Redesign |

2. **Make the Sheet Accessible:**
   - In Google Sheets, click the **Share** button in the top right.
   - Under *General access*, change it to **Anyone with the link can view** (this allows the app to fetch the columns instantly).

> [!TIP]
> **Using Variables:** 
> Any column header you create in your Google Sheet can be used as a variable in your emails! For example, if you have a column named `ServiceOfInterest`, you can insert `{{ServiceOfInterest}}` in your email body, and the app will automatically fill in "Paper Supply" for Jim.

---

### Step 2: Create Your Campaign & Import Leads
1. Launch the app by opening: **[http://localhost:8000](http://localhost:8000)** in your browser.
2. Click **Create Campaign** in the sidebar.
3. Give your campaign a clear name (e.g. `Q3 Web Design Pitch`).
4. **Load Your Leads:**
   - Copy your Google Sheet's URL from the browser address bar.
   - Paste it into the **Load from Google Sheets** input box.
   - Click the blue **Fetch Sheet** button.
5. Review the **Recipient List Preview** grid at the bottom to verify that all your contacts and columns loaded correctly.

![Create Campaign](assets/create_campaign.png)

---

### Step 3: Design Your Email Sequence with Variables
Once your contacts are loaded, click **Customize Email Sequence** to design your messages.

![Customize Email Sequence](assets/campaign_customize_email.png)

1. **Insert Variables:**
   - Place your cursor in the Email Subject or Email Body.
   - Click any of the **blue variable chips** above the editor (e.g. `{{First Name}}`, `{{Company}}`) to insert them into your text.
2. **Review with the Live Preview Selector:**
   - On the right-hand side, look at the **Live Output Preview** panel.
   - Use the **"To:" dropdown menu** inside the preview pane to cycle through different prospects. You can instantly see exactly what Pam's or Jim's personalized email will look like before sending!
3. **Add Follow-Up Steps (Optional):**
   - Click **Add Follow-up Step** to draft a second email.
   - Set the delay (e.g., *Send 3 days after Step 1*).
   - Subsequent follow-ups are automatically threaded as replies to the first email so they land in the same conversation!
4. When you are happy with your templates, click **Launch & Queue Outreach**.

---

### Step 4: Run the Outbox Queue (Send Your Emails)
Your campaigns do not send emails automatically in the background. You have full manual control over when dispatches go out.

1. Click on **Outbox Queue** in the sidebar.
2. You will see a list of scheduled emails waiting to be sent.
3. Click the glowing **Process Send Queue** button.
4. The app will send out your queued emails in real-time through your Google/Gmail account and update their statuses to **Sent**.

![Outbox Queue](assets/outbox_queue.png)

---

## 📈 Tracking Results & Automatic Reply Pause

* **Dashboard Analytics:** Look at the glowing meters on your home dashboard to track your overall outreach health, reply rates, and total sends.
  ![Dashboard](assets/dashboard.png)
* **Scan for Replies:** On the **Outbox Queue** page, click the **Scan for Replies** button. The app will securely scan your inbox for any incoming client responses.
* **Auto-Pause Safety:** If a prospect replies to your email, **the app will automatically pause any subsequent scheduled follow-up steps for that prospect** so you can jump in and follow up manually without automated interference!
  ![Activity Logs](assets/activity_logs.png)
