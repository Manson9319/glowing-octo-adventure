const { google } = require("googleapis");
const fs = require("fs");
const config = require("../config");

const SHEETS = {
  MEALS: "Daily Meals",
  WATER: "Water Intake",
  EXERCISE: "Exercise Log",
  SLEEP: "Sleep Log",
  SUMMARY: "Daily Summary",
  WEEKLY: "Weekly Report",
  PROGRESS: "Progress Tracker",
};

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;
  const keyFile = config.sheets.serviceAccountPath;
  if (!fs.existsSync(keyFile)) throw new Error(`Service account key not found: ${keyFile}`);
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function appendRow(sheetName, values) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

// ── Meals ────────────────────────────────────────────────────────────────────
async function logMeal({ day, date, time, mealType, description, aiAnalysis, giScore, hasPhoto, username }) {
  await appendRow(SHEETS.MEALS, [
    day, date, time, mealType, description,
    giScore || "", hasPhoto ? "Yes" : "No",
    aiAnalysis, username, new Date().toISOString(),
  ]);
}

// ── Water ────────────────────────────────────────────────────────────────────
async function logWater({ day, date, time, rawText, waterMl, dailyTotalMl, aiAnalysis, username }) {
  await appendRow(SHEETS.WATER, [
    day, date, time, rawText, waterMl, dailyTotalMl,
    aiAnalysis, username, new Date().toISOString(),
  ]);
}

// ── Exercise ─────────────────────────────────────────────────────────────────
async function logExercise({ day, date, time, rawText, exerciseType, durationMin, aiAnalysis, username }) {
  await appendRow(SHEETS.EXERCISE, [
    day, date, time, rawText,
    exerciseType || "", durationMin || "",
    aiAnalysis, username, new Date().toISOString(),
  ]);
}

// ── Sleep ────────────────────────────────────────────────────────────────────
async function logSleep({ day, date, rawText, sleepHours, quality, aiAnalysis, username }) {
  await appendRow(SHEETS.SLEEP, [
    day, date, rawText, sleepHours || "", quality || "",
    aiAnalysis, username, new Date().toISOString(),
  ]);
}

// ── Daily summary ────────────────────────────────────────────────────────────
async function logDailySummary({ day, date, summary, totalMeals, totalWaterMl, totalExercises, sleepHours }) {
  await appendRow(SHEETS.SUMMARY, [
    day, date, totalMeals, totalWaterMl || 0,
    totalExercises || 0, sleepHours || "",
    summary, new Date().toISOString(),
  ]);
}

// ── Weekly report ────────────────────────────────────────────────────────────
async function logWeeklyReport({ week, dateRange, report }) {
  await appendRow(SHEETS.WEEKLY, [week, dateRange, report, new Date().toISOString()]);
}

// ── Progress tracker ─────────────────────────────────────────────────────────
async function updateProgress({ day, date, mealsLogged, avgGI, waterMl, exerciseCount, sleepHours, notes }) {
  await appendRow(SHEETS.PROGRESS, [
    day, date, mealsLogged, avgGI || "",
    waterMl || 0, exerciseCount || 0, sleepHours || "",
    notes || "", new Date().toISOString(),
  ]);
}

// ── One-time setup ───────────────────────────────────────────────────────────
async function setupHeaders() {
  const sheets = await getClient();

  const headerSets = [
    {
      range: `${SHEETS.MEALS}!A1`,
      values: [["Day", "Date", "Time", "Meal Type", "Description", "GI Score", "Has Photo", "AI Analysis", "Logged By", "Timestamp"]],
    },
    {
      range: `${SHEETS.WATER}!A1`,
      values: [["Day", "Date", "Time", "Raw Text", "Water (ml)", "Daily Total (ml)", "AI Response", "Logged By", "Timestamp"]],
    },
    {
      range: `${SHEETS.EXERCISE}!A1`,
      values: [["Day", "Date", "Time", "Raw Text", "Exercise Type", "Duration (min)", "AI Analysis", "Logged By", "Timestamp"]],
    },
    {
      range: `${SHEETS.SLEEP}!A1`,
      values: [["Day", "Date", "Raw Text", "Sleep Hours", "Quality", "AI Analysis", "Logged By", "Timestamp"]],
    },
    {
      range: `${SHEETS.SUMMARY}!A1`,
      values: [["Day", "Date", "Total Meals", "Water (ml)", "Exercise Sessions", "Sleep Hours", "Daily Summary", "Timestamp"]],
    },
    {
      range: `${SHEETS.WEEKLY}!A1`,
      values: [["Week", "Date Range", "Weekly Report", "Timestamp"]],
    },
    {
      range: `${SHEETS.PROGRESS}!A1`,
      values: [["Day", "Date", "Meals Logged", "Avg GI", "Water (ml)", "Exercise Sessions", "Sleep Hours", "Notes", "Timestamp"]],
    },
  ];

  for (const { range, values } of headerSets) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheets.spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }
  console.log("Google Sheet headers set up successfully (7 tabs).");
}

module.exports = {
  logMeal, logWater, logExercise, logSleep,
  logDailySummary, logWeeklyReport, updateProgress,
  setupHeaders,
};
