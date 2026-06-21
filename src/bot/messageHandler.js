const dayjs = require("dayjs");
const {
  analyzeMeal, analyzeMealPhoto,
  analyzeWater, analyzeExercise, analyzeSleep,
  generateDailySummary,
} = require("../ai/healthAssistant");
const {
  logMeal, logWater, logExercise, logSleep,
  logDailySummary, updateProgress,
} = require("../sheets/googleSheets");
const {
  addMeal, getTodaysMeals,
  addWater, getTodaysWater,
  addExercise, getTodaysExercises,
  setSleep, getTodaysSleep,
  getCurrentDay, isActive, getState,
} = require("./programmeState");
const config = require("../config");

// ── Detection patterns ────────────────────────────────────────────────────────
const MEAL_RE = /breakfast|lunch|dinner|supper|makan|sarapan|makan pagi|makan tengahari|makan malam|snack|宵夜|早餐|午餐|晚餐|零食|点心/i;
const WATER_RE = /water|air|minum|drink|水|喝|ml|liter|litre|glass|cup|杯|瓶/i;
const EXERCISE_RE = /gym|workout|exercise|senaman|jog|run|walk|yoga|cycling|swim|跑|步行|运动|健身|踩脚车|游泳|zumba|hiit|pilates/i;
const SLEEP_RE = /sleep|tidur|bangun|wake|睡|起床|jam tidur|rest|nap/i;

const MEAL_TYPE_MAP = {
  breakfast: "Breakfast", sarapan: "Breakfast", "makan pagi": "Breakfast", 早餐: "Breakfast",
  lunch: "Lunch", "makan tengahari": "Lunch", 午餐: "Lunch",
  dinner: "Dinner", "makan malam": "Dinner", 晚餐: "Dinner",
  supper: "Supper", 宵夜: "Supper",
  snack: "Snack", 零食: "Snack", 点心: "Snack",
};

// ── Parsers ───────────────────────────────────────────────────────────────────
function detectMealType(text) {
  for (const [key, value] of Object.entries(MEAL_TYPE_MAP)) {
    if (text.toLowerCase().includes(key)) return value;
  }
  return "Meal";
}

function extractGIScore(aiResponse) {
  if (/低GI|low.?gi/i.test(aiResponse)) return "Low";
  if (/中GI|medium.?gi|moderate.?gi/i.test(aiResponse)) return "Medium";
  if (/高GI|high.?gi/i.test(aiResponse)) return "High";
  return "N/A";
}

function parseWaterMl(text) {
  // "500ml" "1.5L" "1 liter" "3 glasses" "8 cups" "3杯"
  const mlMatch = text.match(/(\d+\.?\d*)\s*ml/i);
  if (mlMatch) return Math.round(parseFloat(mlMatch[1]));

  const litreMatch = text.match(/(\d+\.?\d*)\s*(liter|litre|L\b)/i);
  if (litreMatch) return Math.round(parseFloat(litreMatch[1]) * 1000);

  const glassMatch = text.match(/(\d+\.?\d*)\s*(glass|cup|杯|瓶)/i);
  if (glassMatch) return Math.round(parseFloat(glassMatch[1]) * 250);

  // Fallback: any standalone number — assume ml if small, cups if very small
  const numMatch = text.match(/\b(\d+)\b/);
  if (numMatch) {
    const n = parseInt(numMatch[1]);
    return n <= 20 ? n * 250 : n; // ≤20 → treat as cups/glasses
  }
  return 250; // default 1 glass
}

function parseSleep(text) {
  // "7 hours" "7小时" "6.5 jam" "sleep 11pm wake 6am"
  const hourMatch = text.match(/(\d+\.?\d*)\s*(hour|小时|jam|hr)/i);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    const quality = /好|good|well|nyenyak|bagus/i.test(text) ? "Good"
      : /差|bad|poor|tidak|restless/i.test(text) ? "Poor"
      : "Fair";
    return { hours, quality };
  }

  // "sleep 11pm wake 6am" style
  const rangeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm).*?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (rangeMatch) {
    let [, sh, sm = 0, sp, wh, wm = 0, wp] = rangeMatch;
    let start = parseInt(sh) + (sp.toLowerCase() === "pm" && sh !== "12" ? 12 : 0);
    let end = parseInt(wh) + (wp.toLowerCase() === "am" && wh !== "12" ? 0 : wp.toLowerCase() === "pm" ? 12 : 0);
    if (end < start) end += 24;
    const hours = parseFloat((end - start + parseInt(wm) / 60 - parseInt(sm) / 60).toFixed(1));
    return { hours, quality: "Fair" };
  }
  return null;
}

function parseExercise(text) {
  const types = ["gym", "yoga", "jog", "run", "walk", "cycling", "swim", "zumba", "hiit", "pilates", "senaman", "跑步", "步行", "游泳", "健身"];
  const type = types.find((t) => text.toLowerCase().includes(t)) || "Exercise";

  const minMatch = text.match(/(\d+)\s*(min|minute|menit|分钟|分)/i);
  const hrMatch = text.match(/(\d+\.?\d*)\s*(hour|jam|小时|hr)/i);
  const durationMin = minMatch
    ? parseInt(minMatch[1])
    : hrMatch
    ? Math.round(parseFloat(hrMatch[1]) * 60)
    : null;

  return { type, durationMin };
}

// ── Photo download ────────────────────────────────────────────────────────────
async function downloadPhoto(bot, photoArray) {
  const largest = photoArray[photoArray.length - 1];
  const fileLink = await bot.getFileLink(largest.file_id);
  const res = await fetch(fileLink);
  if (!res.ok) throw new Error(`Failed to download photo: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleMessage(bot, msg) {
  const { chat, from, text, photo, caption } = msg;
  const content = text || caption || "";
  const username = from.username ? `@${from.username}` : from.first_name;
  const chatId = chat.id;

  if (content.startsWith("/")) {
    return handleCommand(bot, chatId, content, username, msg);
  }

  if (!content && !photo) return;

  if (!isActive()) {
    if (content || photo) {
      await bot.sendMessage(chatId, "⏳ Programme not started yet. Use /start30days to begin!");
    }
    return;
  }

  // ── Photo message (meal photo) ───────────────────────────────────────────
  if (photo) {
    return handlePhoto(bot, chatId, photo, caption || "", username);
  }

  // ── Text routing ─────────────────────────────────────────────────────────
  if (WATER_RE.test(content)) return handleWater(bot, chatId, content, username);
  if (EXERCISE_RE.test(content)) return handleExerciseLog(bot, chatId, content, username);
  if (SLEEP_RE.test(content)) return handleSleepLog(bot, chatId, content, username);
  if (MEAL_RE.test(content)) return handleMeal(bot, chatId, content, username);
}

// ── Photo meal handler ───────────────────────────────────────────────────────
async function handlePhoto(bot, chatId, photo, caption, username) {
  const day = getCurrentDay();
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const time = now.format("HH:mm");
  const mealType = detectMealType(caption || "Meal");
  const previousMeals = getTodaysMeals().map((m) => m.description);

  await bot.sendChatAction(chatId, "typing");

  let imageBuffer, aiAnalysis, giScore;
  try {
    imageBuffer = await downloadPhoto(bot, photo);
    aiAnalysis = await analyzeMealPhoto(imageBuffer, caption, {
      day, previousMeals, clientName: config.programme.clientName,
    });
    giScore = extractGIScore(aiAnalysis);
  } catch (err) {
    console.error("Photo AI error:", err.message);
    aiAnalysis = "⚠️ Unable to analyse the photo. Please also describe the meal in text.";
    giScore = "N/A";
  }

  const description = caption || `[Photo] ${mealType}`;
  addMeal({ time, mealType, description, giScore, aiAnalysis, hasPhoto: true });

  logMeal({ day, date, time, mealType, description, aiAnalysis, giScore, hasPhoto: true, username }).catch(
    (e) => console.error("Sheet log error:", e.message)
  );

  await bot.sendMessage(chatId, aiAnalysis, { parse_mode: "Markdown" });
}

// ── Text meal handler ────────────────────────────────────────────────────────
async function handleMeal(bot, chatId, content, username) {
  const day = getCurrentDay();
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const time = now.format("HH:mm");
  const mealType = detectMealType(content);
  const previousMeals = getTodaysMeals().map((m) => m.description);

  await bot.sendChatAction(chatId, "typing");

  let aiAnalysis = "", giScore = "N/A";
  try {
    aiAnalysis = await analyzeMeal(content, { day, previousMeals, clientName: config.programme.clientName });
    giScore = extractGIScore(aiAnalysis);
  } catch (err) {
    console.error("AI error:", err.message);
    aiAnalysis = "⚠️ AI analysis temporarily unavailable.";
  }

  addMeal({ time, mealType, description: content, giScore, aiAnalysis, hasPhoto: false });
  logMeal({ day, date, time, mealType, description: content, aiAnalysis, giScore, hasPhoto: false, username }).catch(console.error);
  await bot.sendMessage(chatId, aiAnalysis, { parse_mode: "Markdown" });
}

// ── Water handler ────────────────────────────────────────────────────────────
async function handleWater(bot, chatId, content, username) {
  const day = getCurrentDay();
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const time = now.format("HH:mm");
  const waterMl = parseWaterMl(content);
  const dailyTotalMl = addWater(waterMl);

  await bot.sendChatAction(chatId, "typing");

  let aiAnalysis = "";
  try {
    aiAnalysis = await analyzeWater(content, {
      day, totalWaterMl: dailyTotalMl, clientName: config.programme.clientName,
    });
  } catch (err) {
    console.error("Water AI error:", err.message);
    const pct = Math.round((dailyTotalMl / 2500) * 100);
    aiAnalysis = `💧 +${waterMl}ml recorded! Today: ${dailyTotalMl}ml / 2500ml (${pct}%)`;
  }

  logWater({ day, date, time, rawText: content, waterMl, dailyTotalMl, aiAnalysis, username }).catch(console.error);
  await bot.sendMessage(chatId, aiAnalysis, { parse_mode: "Markdown" });
}

// ── Exercise handler ──────────────────────────────────────────────────────────
async function handleExerciseLog(bot, chatId, content, username) {
  const day = getCurrentDay();
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const time = now.format("HH:mm");
  const { type, durationMin } = parseExercise(content);

  addExercise(content);
  await bot.sendChatAction(chatId, "typing");

  let aiAnalysis = "";
  try {
    aiAnalysis = await analyzeExercise(content, { day, clientName: config.programme.clientName });
  } catch (err) {
    console.error("Exercise AI error:", err.message);
    aiAnalysis = `🏃 Exercise logged: ${type}${durationMin ? ` (${durationMin} min)` : ""}. Keep it up!`;
  }

  logExercise({ day, date, time, rawText: content, exerciseType: type, durationMin, aiAnalysis, username }).catch(console.error);
  await bot.sendMessage(chatId, aiAnalysis, { parse_mode: "Markdown" });
}

// ── Sleep handler ─────────────────────────────────────────────────────────────
async function handleSleepLog(bot, chatId, content, username) {
  const day = getCurrentDay();
  const now = dayjs();
  const date = now.format("YYYY-MM-DD");
  const parsed = parseSleep(content);

  if (parsed) setSleep(parsed.hours, parsed.quality);
  await bot.sendChatAction(chatId, "typing");

  let aiAnalysis = "";
  try {
    aiAnalysis = await analyzeSleep(content, { day, clientName: config.programme.clientName });
  } catch (err) {
    console.error("Sleep AI error:", err.message);
    aiAnalysis = `😴 Sleep logged${parsed ? `: ${parsed.hours}h (${parsed.quality})` : ""}. Rest well!`;
  }

  logSleep({
    day, date, rawText: content,
    sleepHours: parsed?.hours, quality: parsed?.quality,
    aiAnalysis, username,
  }).catch(console.error);
  await bot.sendMessage(chatId, aiAnalysis, { parse_mode: "Markdown" });
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function handleCommand(bot, chatId, text, username) {
  const cmd = text.split(" ")[0].toLowerCase();

  switch (cmd) {
    case "/start30days": {
      const { startProgramme } = require("./programmeState");
      startProgramme();
      await bot.sendMessage(
        chatId,
        `🚀 *30天代谢 & 血糖管理计划已开始！*\n\n` +
        `👤 学员：${config.programme.clientName}\n` +
        `👩‍⚕️ 导师：${config.programme.mentorName}\n` +
        `🤖 AI助理：已就位\n\n` +
        `📝 *记录方式（直接发送即可）：*\n` +
        `📸 拍照发给我 → AI分析餐点\n` +
        `🍽 文字描述餐点 → 早餐/午餐/晚餐/零食\n` +
        `💧 水分记录 → "喝了500ml水" / "2 glasses of water"\n` +
        `🏃 运动记录 → "跑步30分钟" / "gym 1 hour"\n` +
        `😴 睡眠记录 → "昨晚睡了7小时" / "sleep 7 hours"\n\n` +
        `加油！💪 Anniisa 导师和AI助理陪你走完30天！`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "/today": {
      const day = getCurrentDay();
      const meals = getTodaysMeals();
      const water = getTodaysWater();
      const exercises = getTodaysExercises();
      const sleep = getTodaysSleep();

      const mealList = meals.length
        ? meals.map((m, i) => `  ${i + 1}. [${m.time}] ${m.hasPhoto ? "📸" : "📝"} ${m.mealType}: ${m.description.slice(0, 50)}`).join("\n")
        : "  (未记录)";

      const pct = Math.round((water / 2500) * 100);
      const waterBar = "🔵".repeat(Math.min(10, Math.floor(pct / 10))) + "⚪".repeat(10 - Math.min(10, Math.floor(pct / 10)));

      await bot.sendMessage(
        chatId,
        `📋 *第 ${day} 天记录*\n\n` +
        `🍽 *餐点 (${meals.length})*\n${mealList}\n\n` +
        `💧 *水分*  ${water}ml / 2500ml  ${pct}%\n${waterBar}\n\n` +
        `🏃 *运动 (${exercises.length})*\n${exercises.length ? exercises.map((e, i) => `  ${i + 1}. ${e.slice(0, 60)}`).join("\n") : "  (未记录)"}\n\n` +
        `😴 *睡眠*  ${sleep ? `${sleep.hours}h — ${sleep.quality}` : "(未记录)"}`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "/summary": {
      const day = getCurrentDay();
      const meals = getTodaysMeals();
      const water = getTodaysWater();
      const exercises = getTodaysExercises();
      const sleep = getTodaysSleep();

      if (!meals.length && !water && !exercises.length && !sleep) {
        await bot.sendMessage(chatId, "今天还没有任何记录，无法生成总结。");
        return;
      }

      await bot.sendChatAction(chatId, "typing");

      const dayData = {
        meals: meals.map((m) => `${m.mealType}: ${m.description}`),
        waterMl: water,
        exercises: exercises,
        sleep,
      };

      let summary;
      try {
        summary = await generateDailySummary(dayData, day, config.programme.clientName);
      } catch (err) {
        console.error("Summary error:", err.message);
        summary = `📅 第 ${day} 天总结\n餐点: ${meals.length}次 | 水分: ${water}ml | 运动: ${exercises.length}次 | 睡眠: ${sleep?.hours || "?"}h`;
      }

      const date = dayjs().format("YYYY-MM-DD");
      logDailySummary({
        day, date, summary,
        totalMeals: meals.length,
        totalWaterMl: water,
        totalExercises: exercises.length,
        sleepHours: sleep?.hours,
      }).catch(console.error);
      updateProgress({
        day, date,
        mealsLogged: meals.length,
        waterMl: water,
        exerciseCount: exercises.length,
        sleepHours: sleep?.hours,
      }).catch(console.error);

      await bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
      break;
    }

    case "/status": {
      const state = getState();
      const day = state.currentDay;
      const remaining = config.programme.days - day;
      const water = getTodaysWater();
      await bot.sendMessage(
        chatId,
        `📊 *Programme Status*\n\n` +
        `📅 Day ${day}/${config.programme.days}  (${remaining} days remaining)\n` +
        `🗓 Started: ${state.startDate || "Not started"}\n\n` +
        `*Today so far:*\n` +
        `🍽 Meals: ${state.todaysMeals?.length || 0}\n` +
        `💧 Water: ${water}ml / 2500ml\n` +
        `🏃 Exercise: ${state.todaysExercises?.length || 0} session(s)\n` +
        `😴 Sleep: ${state.todaysSleep ? `${state.todaysSleep.hours}h` : "not logged"}`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "/help": {
      await bot.sendMessage(
        chatId,
        `🤖 *AI 健康助理 — 记录指南*\n\n` +
        `*📸 拍照记录餐点*\n直接发送食物照片（可加文字说明）\n\n` +
        `*🍽 文字记录餐点*\n"早餐 燕麦粥加蓝莓" / "lunch grilled chicken"\n\n` +
        `*💧 记录水分*\n"喝了500ml水" / "3 glasses water" / "minum 1 liter"\n\n` +
        `*🏃 记录运动*\n"跑步30分钟" / "gym 1 hour" / "yoga 45 mins"\n\n` +
        `*😴 记录睡眠*\n"昨晚睡了7小时" / "sleep 11pm wake 6am"\n\n` +
        `*指令：*\n` +
        `/today — 今日所有记录\n` +
        `/summary — 生成今日健康总结\n` +
        `/status — 计划进度\n` +
        `/start30days — 开始计划`,
        { parse_mode: "Markdown" }
      );
      break;
    }
  }
}

module.exports = { handleMessage };
