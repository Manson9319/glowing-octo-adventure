const { google } = require("googleapis");
const fs = require("fs");
const config = require("../config");

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

async function readSheet(sheetName, range) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheets.spreadsheetId,
    range: `${sheetName}!${range}`,
  });
  return res.data.values || [];
}

// Fetch last N days of data aggregated for the progress report
async function fetchProgressData(days) {
  const [progressRows, mealRows, exerciseRows, sleepRows] = await Promise.all([
    readSheet("Progress Tracker", "A2:I200"),
    readSheet("Daily Meals", "A2:J500"),
    readSheet("Exercise Log", "A2:I300"),
    readSheet("Sleep Log", "A2:H200"),
  ]);

  // Progress Tracker cols: Day|Date|Meals|AvgGI|Water|ExSessions|SleepHrs|Notes|TS
  const progressByDay = {};
  for (const row of progressRows) {
    const dayNum = parseInt(row[0]);
    if (!dayNum || dayNum < 1) continue;
    progressByDay[dayNum] = {
      day: dayNum,
      date: row[1] || "",
      mealsLogged: parseInt(row[2]) || 0,
      avgGI: row[3] || "N/A",
      waterMl: parseInt(row[4]) || 0,
      exerciseSessions: parseInt(row[5]) || 0,
      sleepHours: parseFloat(row[6]) || 0,
      notes: row[7] || "",
    };
  }

  // Meal rows cols: Day|Date|Time|MealType|Description|GIScore|HasPhoto|AIAnalysis|LoggedBy|TS
  const mealsByDay = {};
  for (const row of mealRows) {
    const dayNum = parseInt(row[0]);
    if (!dayNum) continue;
    if (!mealsByDay[dayNum]) mealsByDay[dayNum] = [];
    mealsByDay[dayNum].push({
      time: row[2] || "",
      mealType: row[3] || "",
      description: row[4] || "",
      giScore: row[5] || "N/A",
      hasPhoto: row[6] === "Yes",
    });
  }

  // Exercise rows cols: Day|Date|Time|RawText|ExType|DurationMin|AIAnalysis|LoggedBy|TS
  const exerciseByDay = {};
  for (const row of exerciseRows) {
    const dayNum = parseInt(row[0]);
    if (!dayNum) continue;
    if (!exerciseByDay[dayNum]) exerciseByDay[dayNum] = [];
    exerciseByDay[dayNum].push({
      type: row[4] || row[3] || "Exercise",
      durationMin: parseInt(row[5]) || null,
    });
  }

  // Sleep rows cols: Day|Date|RawText|SleepHours|Quality|AIAnalysis|LoggedBy|TS
  const sleepByDay = {};
  for (const row of sleepRows) {
    const dayNum = parseInt(row[0]);
    if (!dayNum) continue;
    sleepByDay[dayNum] = {
      hours: parseFloat(row[3]) || 0,
      quality: row[4] || "Fair",
    };
  }

  // Determine which days to include
  const allDays = Object.keys(progressByDay).map(Number).sort((a, b) => a - b);
  const recentDays = allDays.slice(-days);

  return recentDays.map((dayNum) => ({
    ...(progressByDay[dayNum] || { day: dayNum, date: "", mealsLogged: 0, waterMl: 0, exerciseSessions: 0, sleepHours: 0 }),
    meals: mealsByDay[dayNum] || [],
    exercises: exerciseByDay[dayNum] || [],
    sleep: sleepByDay[dayNum] || null,
  }));
}

module.exports = { fetchProgressData };
