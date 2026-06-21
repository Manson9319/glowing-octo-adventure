require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const config = require("./config");
const { handleMessage } = require("./bot/messageHandler");
const { startScheduler } = require("./bot/scheduler");

if (!config.telegram.token) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const bot = new TelegramBot(config.telegram.token, { polling: true });

bot.on("message", async (msg) => {
  try {
    await handleMessage(bot, msg);
  } catch (err) {
    console.error("Message handler error:", err.message);
  }
});

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

startScheduler(bot);

// Health check endpoint for Docker
const app = express();
app.get("/health", (_, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.listen(config.telegram.port || 3000);

console.log(
  `🤖 Meal Tracking Bot started!\n` +
  `👤 Client: ${config.programme.clientName}\n` +
  `👩‍⚕️ Mentor: ${config.programme.mentorName}\n` +
  `📅 Programme: ${config.programme.days} days\n` +
  `🌏 Timezone: ${config.programme.timezone}`
);
