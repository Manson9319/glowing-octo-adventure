require("dotenv").config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    groupChatId: process.env.TELEGRAM_GROUP_CHAT_ID,
    clientUsername: process.env.CLIENT_TELEGRAM_USERNAME || "@ChloeLeow",
    mentorUsername: process.env.MENTOR_TELEGRAM_USERNAME || "@Anniisa",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-2.5-flash",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-haiku-4-5-20251001",
  },
  sheets: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "./secrets/google-service-account.json",
  },
  programme: {
    days: parseInt(process.env.PROGRAMME_DAYS || "30"),
    clientName: process.env.CLIENT_NAME || "ChloeLeow",
    mentorName: process.env.MENTOR_NAME || "Anniisa",
    startDate: process.env.PROGRAMME_START_DATE || null,
    timezone: process.env.TZ || "Asia/Kuala_Lumpur",
  },
};
