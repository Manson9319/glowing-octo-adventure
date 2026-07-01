/**
 * Standalone report script — run from terminal:
 *   node src/scripts/generateReport.js 7
 *   node src/scripts/generateReport.js 14
 *
 * Outputs the report to console and optionally sends to Telegram group.
 */
require("dotenv").config();
const { fetchProgressData } = require("../sheets/reportData");
const { generateProgressReport } = require("../ai/healthAssistant");
const config = require("../config");

const days = parseInt(process.argv[2]) || 7;
if (![7, 14, 30].includes(days)) {
  console.error("Usage: node generateReport.js <7|14|30>");
  process.exit(1);
}

async function sendToTelegram(text) {
  if (!config.telegram.token || !config.telegram.groupChatId) return;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 4000) {
    let cut = remaining.lastIndexOf("\n", 4000);
    if (cut < 1000) cut = 4000;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);

  for (const chunk of chunks) {
    const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.groupChatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn("Telegram send warning:", err);
    }
  }
}

(async () => {
  console.log(`\n📊 Generating ${days}-day progress report for ${config.programme.clientName}...\n`);

  let data;
  try {
    data = await fetchProgressData(days);
  } catch (err) {
    console.error("❌ Failed to fetch Google Sheet data:", err.message);
    console.error("Make sure GOOGLE_SHEET_ID and service account are configured.");
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.warn(`⚠️  No data found for the last ${days} days in Progress Tracker.`);
    console.warn("Run the bot for a few days first, then generate the report.");
    process.exit(0);
  }

  console.log(`Found data for ${data.length} day(s). Generating AI report...\n`);

  const report = await generateProgressReport(
    days, data,
    config.programme.clientName,
    config.programme.mentorName
  );

  console.log("═".repeat(60));
  console.log(report);
  console.log("═".repeat(60));

  const shouldSend = process.argv.includes("--send");
  if (shouldSend) {
    console.log("\n📤 Sending report to Telegram group...");
    await sendToTelegram(report);
    console.log("✅ Sent!");
  } else {
    console.log("\n💡 Add --send flag to also send this to the Telegram group:");
    console.log(`   node src/scripts/generateReport.js ${days} --send`);
  }
})();
