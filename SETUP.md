# 30-Day Meal Tracking Group Chat — Setup Guide

**Participants:** ChloeLeow (client) · Anniisa (mentor) · AI健康助理 (bot)

---

## Architecture

```
Telegram Group Chat
       │
       ▼
Telegram Bot (Node.js)
       │
       ├──► Gemini 2.5 Flash API  (AI meal analysis)
       │
       └──► Google Sheets API     (data logging)

Running on: Mac mini → Docker → Node.js app
Optional:   n8n (visual workflow editor on port 5678)
```

---

## Step 1 — Create Telegram Bot

1. Open Telegram → search **@BotFather**
2. Send `/newbot` → follow prompts → copy the **Bot Token**
3. Create a Telegram Group: Add ChloeLeow, Anniisa, and the new bot
4. Send `/start` in the group
5. Get the Group Chat ID:
   - Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Find `"chat":{"id":` — it will be a negative number like `-1001234567890`

---

## Step 2 — Google Gemini API Key

1. Go to **Google AI Studio**: https://aistudio.google.com/
2. Click **Get API key** → Create API key
3. Copy the key (free tier: 15 req/min, 1500/day — enough for this programme)

---

## Step 3 — Google Sheets Setup

### A. Create the Spreadsheet
1. Go to Google Sheets → Create new spreadsheet
2. Name it: `ChloeLeow - 30 Day Meal Tracking`
3. Create 4 tabs (sheets):
   - `Daily Meals`
   - `Daily Summary`
   - `Weekly Report`
   - `Progress Tracker`
4. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

### B. Create Service Account
1. Go to **Google Cloud Console**: https://console.cloud.google.com/
2. Create new project (or use existing)
3. Enable **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Download the JSON key file
6. Place it at: `secrets/google-service-account.json`
7. Share your Google Sheet with the service account email (Editor access)

---

## Step 4 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_GROUP_CHAT_ID=-1001234567890
GEMINI_API_KEY=AIzaSy...
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
CLIENT_NAME=ChloeLeow
MENTOR_NAME=Anniisa
MENTOR_TELEGRAM_USERNAME=@Anniisa
CLIENT_TELEGRAM_USERNAME=@ChloeLeow
TZ=Asia/Kuala_Lumpur
```

---

## Step 5 — Install Docker (Mac mini)

```bash
# Install Docker Desktop from https://www.docker.com/products/docker-desktop/
# Then start Docker Desktop

# Verify:
docker --version
docker compose version
```

---

## Step 6 — Run the Bot

```bash
# Clone this repo on your Mac mini
git clone https://github.com/manson9319/glowing-octo-adventure.git
cd glowing-octo-adventure

# Set up your .env and secrets/google-service-account.json

# Initialize Google Sheet headers (run once)
npm install
npm run setup-sheet

# Start with Docker
docker compose up -d meal-bot

# View logs
docker compose logs -f meal-bot
```

---

## Step 7 — Start the Programme

In the Telegram group, send:
```
/start30days
```

---

## Daily Usage

| Who | What to send |
|-----|-------------|
| ChloeLeow | `早餐 燕麦粥加蓝莓和坚果` |
| ChloeLeow | `lunch grilled chicken with brown rice and salad` |
| ChloeLeow | `晚餐 蒸鱼配蔬菜和糙米` |
| Anyone | `/summary` — generate today's health summary |
| Anyone | `/today` — list today's meals |
| Anyone | `/status` — programme progress |

**AI will automatically:**
- Analyse GI index for each meal
- Assess blood sugar impact
- Provide metabolism tips
- Send daily reminders (7:30am, 12pm, 7:30pm)
- Auto-generate daily summary at 10pm
- Generate weekly report every Sunday 9pm

---

## Google Sheet Columns

### Daily Meals tab
| Day | Date | Time | Meal Type | Description | GI Score | AI Analysis | Logged By | Timestamp |

### Daily Summary tab
| Day | Date | Total Meals | Daily Summary | Timestamp |

### Weekly Report tab
| Week | Date Range | Weekly Report | Timestamp |

### Progress Tracker tab
| Day | Date | Meals Logged | Avg GI | Notes | Timestamp |

---

## Security Checklist

- [x] API keys stored in `.env` (never in code)
- [x] `.env` in `.gitignore`
- [x] Service account JSON in `secrets/` (never committed)
- [x] `secrets/` in `.gitignore`
- [ ] Do NOT share screenshots of `.env` or API keys
- [ ] Rotate keys if accidentally exposed

---

## Optional: n8n Visual Editor

```bash
docker compose up -d n8n
# Open: http://localhost:5678
# Default login: admin / changeme (CHANGE THIS!)
# Import: n8n/meal-tracking-workflow.json
```

---

## Troubleshooting

**Bot not responding?**
```bash
docker compose logs meal-bot
# Check TELEGRAM_BOT_TOKEN is correct
# Ensure bot is admin in the group
```

**Google Sheet not logging?**
```bash
# Check service account has Editor access to the sheet
# Verify GOOGLE_SHEET_ID is correct
npm run setup-sheet
```

**AI not analysing?**
```bash
# Check GEMINI_API_KEY is valid
# Test: curl https://generativelanguage.googleapis.com/v1/models?key=YOUR_KEY
```
