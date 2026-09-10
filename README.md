# A3CEND Outreach

**Production-structured, test-mode-first email outreach automation platform.**

Built with Next.js 16, TypeScript, Tailwind CSS, SendGrid, and Supabase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS |
| Backend | Next.js Route Handlers (server-side API) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Email | SendGrid Mail Send API + Dynamic Templates |
| Events | SendGrid Event Webhook |
| Replies | SendGrid Inbound Parse Webhook |
| Scheduling | Database-backed `follow_up_due_at` + cron endpoint |

---

## Requirements

- Node.js 18+
- npm
- Supabase account (free tier works)
- SendGrid account with:
  - Verified sender domain/email
  - 3 Dynamic Templates created
  - Event Webhook configured
  - Inbound Parse configured (for reply detection)

---

## 🚀 Deploying to Vercel & GitHub

### Step 1: Push Code to GitHub

```bash
git add .
git commit -m "feat: A3CEND Outreach platform ready for production"
git branch -M main
git remote add origin https://github.com/<your-username>/a3cend-outreach.git
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Log into [vercel.com](https://vercel.com) and click **"Add New Project"**.
2. Import your GitHub repository `a3cend-outreach`.
3. Under **Environment Variables**, add the following keys from your `.env.local`:

| Variable | Description | Example / Recommended |
|---|---|---|
| `SENDGRID_API_KEY` | SendGrid API Key | `SG.xxxx...` |
| `SENDGRID_FROM_EMAIL` | Verified sender email | `nikshitha.v@a3cend.com` |
| `SENDGRID_FROM_NAME` | Sender display name | `A3CEND` |
| `NEXT_PUBLIC_SENDGRID_FROM_EMAIL` | Form default email | `nikshitha.v@a3cend.com` |
| `NEXT_PUBLIC_SENDGRID_FROM_NAME` | Form default name | `A3CEND` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key | `sb_publishable_xxxx...` |
| `SUPABASE_SECRET_KEY` | Supabase Secret Role Key | `sb_secret_xxxx...` |
| `APP_URL` | Your production Vercel URL | `https://your-project.vercel.app` |
| `CRON_SECRET` | Secret token for cron processor | A strong random string |
| `NEXT_PUBLIC_INITIAL_TEMPLATE_ID` | Default Initial Template ID | `d-99cb8ad040a146cbb7b83277df6014fd` |
| `NEXT_PUBLIC_OPENED_NO_REPLY_TEMPLATE_ID` | Default Opened Template ID | `d-991c648e50bb4c1c848587b89f2fa9f4` |
| `NEXT_PUBLIC_NO_OPEN_TEMPLATE_ID` | Default No Open Template ID | `d-35192641bf8a4ddc9933d1f191dc6cf1` |

4. Click **Deploy**. Vercel will build the Next.js project and provide your live URL (`https://<project-name>.vercel.app`).

### Step 3: Vercel Cron Scheduling

The project includes [`vercel.json`](./vercel.json) configured to run the follow-up processor automatically:
```json
{
  "crons": [{ "path": "/api/cron/process-followups", "schedule": "*/5 * * * *" }]
}
```
Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when invoking this endpoint every 5 minutes.

### Step 4: Configure SendGrid Webhooks in Production

Once your Vercel deployment is live:

1. **Event Webhook** (for opens, clicks, bounces):
   - In SendGrid → Settings → Mail Settings → **Event Webhook**.
   - HTTP Post URL: `https://<your-project>.vercel.app/api/sendgrid/events`
   - Check: Delivered, Opened, Clicked, Bounced, Unsubscribed, Spam Report.

2. **Inbound Parse** (for reply detection):
   - In SendGrid → Settings → **Inbound Parse**.
   - Destination URL: `https://<your-project>.vercel.app/api/sendgrid/inbound`

---

## Local Development Installation

```bash
git clone <repo>
cd a3cend-outreach-test
npm install
cp .env.example .env.local
# Edit .env.local with your credentials
npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
# SendGrid
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=you@yourdomain.com
SENDGRID_FROM_NAME=Your Name

# Supabase (public — safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx

# Supabase (secret — SERVER SIDE ONLY)
SUPABASE_SECRET_KEY=sb_secret_xxxx

# App
APP_URL=http://localhost:3000
CRON_SECRET=your_random_secret_here
```

> **Never commit `.env.local` to source control.**

---

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Copy and run the contents of `supabase/migrations/001_initial_schema.sql`
4. This creates all 7 tables with indexes and Row Level Security

---

## SendGrid Setup

### API Key
1. Go to SendGrid → Settings → API Keys
2. Create API key with **Full Access** or **Mail Send** + **Template Engine** permissions
3. Copy to `SENDGRID_API_KEY`

### Sender Authentication
1. Go to Settings → Sender Authentication
2. Verify your sending domain or single sender email
3. Use that email as `SENDGRID_FROM_EMAIL`

### Dynamic Templates
1. Go to Email API → Dynamic Templates
2. Create 3 templates:
   - **Initial Outreach** — First email to contacts
   - **No Open Follow-up** — Sent when Email #1 was not opened
   - **Opened No Reply** — Sent when Email #1 was opened but no reply
3. Copy each template ID (format: `d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
4. Enter them in the Campaign Creation form

#### Template Variables
Use these Handlebars variables in your templates:
```
{{firstName}}
{{lastName}}
{{email}}
{{company}}
{{designation}}
```

---

## Event Webhook Setup

1. Go to SendGrid → Settings → Mail Settings → Event Webhook
2. Set HTTP Post URL to: `https://your-domain.com/api/sendgrid/events`
3. Check these events:
   - ✅ Processed
   - ✅ Delivered
   - ✅ Opened
   - ✅ Clicked
   - ✅ Bounced
   - ✅ Dropped
   - ✅ Deferred
   - ✅ Spam Reports
   - ✅ Unsubscribes
4. Save

---

## Inbound Parse Setup (Reply Detection)

1. Go to SendGrid → Settings → Inbound Parse
2. Add a host entry:
   - **Domain**: `mail.yourdomain.com` (configure MX record to `mx.sendgrid.net`)
   - **URL**: `https://your-domain.com/api/sendgrid/inbound`
3. Check "POST the raw, full MIME message"
4. Save

---

## Local Webhook Testing

SendGrid cannot reach `localhost`. Use a tunnel:

### Option 1: ngrok
```bash
# Install ngrok from https://ngrok.com/
ngrok http 3000
# Copy the https://xxxx.ngrok.io URL
# Use that as your webhook base URL in SendGrid
```

### Option 2: Cloudflare Tunnel
```bash
cloudflared tunnel --url http://localhost:3000
```

Update `APP_URL` in `.env.local` to your tunnel URL.

---

## Starting Development Server

```bash
npm run dev
# Open http://localhost:3000
```

---

## Cron Setup (Follow-up Processor)

The follow-up processor runs at `POST /api/cron/process-followups`.

Call it every 5 minutes for testing:

```bash
# Manual trigger (test)
curl -X POST http://localhost:3000/api/cron/process-followups \
  -H "Authorization: Bearer your_cron_secret"

# Or use the GET endpoint (same logic)
curl http://localhost:3000/api/cron/process-followups \
  -H "Authorization: Bearer your_cron_secret"
```

For production, use a scheduler (Vercel Cron, GitHub Actions, or a simple cron):
```bash
# crontab -e
*/5 * * * * curl -X POST https://your-domain.com/api/cron/process-followups -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Running a Test Campaign

### Step 1: Import Test Contacts
1. Go to Contacts → Import CSV
2. Upload a CSV with columns: Name, Last Name, Email, Company, Designation
3. Preview and validate rows
4. Import selected contacts

### Step 2: Configure Templates
1. Go to Campaigns → New Campaign
2. Enter your 3 SendGrid template IDs
3. Set follow-up delay to **5 minutes** (test mode)
4. Enable Test Mode ✓

### Step 3: Start Campaign
1. On the campaign detail page, click **"Start Test Campaign"**
2. Review the confirmation modal (contacts, templates, delay)
3. Confirm to send

---

## Testing Scenario 1 — No Open

**Contact A receives Email #1. Does NOT open it.**

1. After 5 minutes, the cron processor fires
2. Check: `opened = false` → sends **No Open template**
3. Verify in campaign contacts table: status = `follow_up_sent`

```bash
# Manually trigger the cron
curl -X POST http://localhost:3000/api/cron/process-followups \
  -H "Authorization: Bearer a3cend_cron_secret_local_dev_only"
```

---

## Testing Scenario 2 — Opened No Reply

**Contact B receives Email #1. Opens it. Does NOT reply.**

1. SendGrid fires an `open` event → `POST /api/sendgrid/events`
2. Application sets `opened = true`
3. After 5 minutes, cron fires
4. Check: `opened = true, replied = false` → sends **Opened No Reply template**

Simulate an open event:
```bash
curl -X POST http://localhost:3000/api/sendgrid/events \
  -H "Content-Type: application/json" \
  -d '[{
    "event": "open",
    "sg_event_id": "test-open-001",
    "campaign_id": "YOUR_CAMPAIGN_ID",
    "contact_id": "YOUR_CONTACT_ID",
    "campaign_contact_id": "YOUR_CC_ID",
    "sequence_step": "1",
    "timestamp": '$(date +%s)'
  }]'
```

---

## Testing Scenario 3 — Reply Received

**Contact C receives Email #1. Replies to it.**

The reply goes to your SendGrid Inbound Parse URL.

1. Contact replies to the email
2. SendGrid forwards to `POST /api/sendgrid/inbound`
3. Application identifies sender, sets `replied = true, stopped = true`
4. Cron skips this contact permanently

Simulate a reply:
```bash
curl -X POST http://localhost:3000/api/sendgrid/inbound \
  -F "from=Contact Name <contact@example.com>" \
  -F "to=you@yourdomain.com" \
  -F "subject=Re: Your outreach" \
  -F "text=Thanks for reaching out!"
```

---

## Testing Scenario 4 — Bounce

**Contact D has an invalid email.**

1. SendGrid fires a `bounce` event
2. Application sets `bounced = true, stopped = true`
3. Cron skips this contact permanently

---

## Health Check

```bash
curl http://localhost:3000/api/health
# {"database":"ok","sendgrid":"configured","from_email":"configured"}
```

---

## Security Notes

- `SENDGRID_API_KEY` — Server-side only. Never in browser.
- `SUPABASE_SECRET_KEY` — Server-side only. Never in browser.
- All sensitive operations go through API routes.
- Webhook events are processed idempotently (same event never triggers twice).
- Cron endpoint is protected by `CRON_SECRET`.
- Row Level Security enabled on all Supabase tables.
- No PII is stored in SendGrid `custom_args` — only UUIDs.

---

## Production Deployment

1. Deploy to Vercel, Railway, or any Node.js host
2. Set all environment variables in the hosting platform
3. Update `APP_URL` to your production domain
4. Update SendGrid webhook URLs to production URLs
5. Set up a real cron scheduler for the follow-up processor
6. Verify `GET /api/health` returns `{"database":"ok","sendgrid":"configured"}`

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── health/
│   │   ├── dashboard/
│   │   ├── contacts/import/
│   │   ├── campaigns/
│   │   │   ├── route.ts (GET list, POST create)
│   │   │   └── [id]/
│   │   │       ├── route.ts (GET detail)
│   │   │       ├── start/route.ts
│   │   │       ├── pause/route.ts
│   │   │       ├── resume/route.ts
│   │   │       ├── stop/route.ts
│   │   │       ├── send-test/route.ts
│   │   │       ├── contacts/route.ts
│   │   │       └── activity/route.ts
│   │   ├── sendgrid/
│   │   │   ├── events/route.ts (Event Webhook)
│   │   │   └── inbound/route.ts (Inbound Parse)
│   │   └── cron/
│   │       └── process-followups/route.ts
│   ├── campaigns/ (UI pages)
│   ├── contacts/
│   ├── templates/
│   ├── activity/
│   ├── settings/
│   └── page.tsx (Dashboard)
├── components/
│   ├── layout/ (Sidebar, TestModeBanner)
│   ├── contacts/ (CSVImporter)
│   ├── campaigns/ (StartCampaignModal)
│   └── ui/ (StatusBadge)
└── lib/
    ├── supabase/ (client.ts, server.ts, types.ts)
    └── sendgrid/ (client.ts)

supabase/
└── migrations/
    └── 001_initial_schema.sql
```
