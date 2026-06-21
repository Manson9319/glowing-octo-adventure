const { google } = require("googleapis");
const fs = require("fs");
const dayjs = require("dayjs");
const config = require("../config");

const SHEETS = {
  MEALS: "Daily Meals",
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

async function logMeal({ day, date, time, mealType, description, aiAnalysis, giScore, username }) {
  const row = [
    day,
    date,
    time,
    mealType,
    description,
    giScore || "",
    aiAnalysis,
    username,
    new Date().toISOString(),
  ];
  await appendRow(SHEETS.MEALS, row);
}

async function logDailySummary({ day, date, summary, totalMeals }) {
  const row = [day, date, totalMeals, summary, new Date().toISOString()];
  await appendRow(SHEETS.SUMMARY, row);
}

async function logWeeklyReport({ week, dateRange, report }) {
  const row = [week, dateRange, report, new Date().toISOString()];
  await appendRow(SHEETS.WEEKLY, row);
}

async function updateProgress({ day, date, mealsLogged, avgGI, notes }) {
  const row = [day, date, mealsLogged, avgGI || "", notes || "", new Date().toISOString()];
  await appendRow(SHEETS.PROGRESS, row);
}

// Called once to set up all sheet headers
async function setupHeaders() {
  const sheets = await getClient();

  const headerSets = [
    {
      range: `${SHEETS.MEALS}!A1`,
      values: [["Day", "Date", "Time", "Meal Type", "Description", "GI Score", "AI Analysis", "Logged By", "Timestamp"]],
    },
    {
      range: `${SHEETS.SUMMARY}!A1`,
      values: [["Day", "Date", "Total Meals", "Daily Summary", "Timestamp"]],
    },
    {
      range: `${SHEETS.WEEKLY}!A1`,
      values: [["Week", "Date Range", "Weekly Report", "Timestamp"]],
    },
    {
      range: `${SHEETS.PROGRESS}!A1`,
      values: [["Day", "Date", "Meals Logged", "Avg GI", "Notes", "Timestamp"]],
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
  console.log("Google Sheet headers set up successfully.");
}

module.exports = { logMeal, logDailySummary, logWeeklyReport, updateProgress, setupHeaders };
