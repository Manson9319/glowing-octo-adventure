const dayjs = require("dayjs");
const { analyzeMeal, generateDailySummary, generateWeeklyReport } = require("../ai/healthAssistant");
const { logMeal, logDailySummary, logWeeklyReport, updateProgress } = require("../sheets/googleSheets");
const { addMeal, getTodaysMeals, getCurrentDay, isActive, getState } = require("./programmeState");
const config = require("../config");

const MEAL_KEYWORDS = /breakfast|lunch|dinner|supper|makan|sarapan|makan pagi|makan tengahari|makan malam|snack|supper|宵夜|早餐|午餐|晚餐|零食|点心/i;
const MEAL_TYPE_MAP = {
  breakfast: "Breakfast", sarapan: "Breakfast", "makan pagi": "Breakfast", 早餐: "Breakfast",
  lunch: "Lunch", "makan tengahari": "Lunch", 午餐: "Lunch",
  dinner: "Dinner", "makan malam": "Dinner", 晚餐: "Dinner",
  supper: "Supper", 宵夜: "Supper",
  snack: "Snack", 零食: "Snack", 点心: "Snack",
};

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

async function handleMessage(bot, msg) {
  const { chat, from, text, photo, caption } = msg;
  if (!text && !caption) return;

  const content = text || caption || "";
  const username = from.username ? `@${from.username}` : from.first_name;
  const chatId = chat.id;

  // ── Commands ──────────────────────────────────────────────────────────────
  if (content.startsWith("/")) {
    return handleCommand(bot, chatId, content, username);
  }

  // ── Meal detection ────────────────────────────────────────────────────────
  if (!MEAL_KEYWORDS.test(content)) return;
  if (!isActive()) {
    return bot.sendMessage(chatId, "⏳ Programme not started yet. Use /start30days to begin!");
  }

  const day = getCurrentDay();
  const now = dayjs().tz ? dayjs().tz(config.programme.timezone) : dayjs();
  const date = now.format("YYYY-MM-DD");
  const time = now.format("HH:mm");
  const mealType = detectMealType(content);
  const previousMeals = getTodaysMeals().map((m) => m.description);

  // Typing indicator
  await bot.sendChatAction(chatId, "typing");

  let aiAnalysis = "";
  let giScore = "N/A";

  try {
    aiAnalysis = await analyzeMeal(content, {
      day,
      previousMeals,
      clientName: config.programme.clientName,
    });
    giScore = extractGIScore(aiAnalysis);
  } catch (err) {
    console.error("AI error:", err.message);
    aiAnalysis = "⚠️ AI analysis temporarily unavailable.";
  }

  const mealEntry = { time, mealType, description: content, giScore, aiAnalysis };
  addMeal(mealEntry);

  // Log to Google Sheet (non-blocking)
  logMeal({ day, date, time, mealType, description: content, aiAnalysis, giScore, username }).catch(
    (e) => console.error("Sheet log error:", e.message)
  );

  await bot.sendMessage(chatId, aiAnalysis, { parse_mode: "Markdown" });
}

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
          `📝 *记录方式：*\n` +
          `直接在群组发送你的餐点内容，例如：\n` +
          `_"早餐 吃了燕麦粥加蓝莓"_\n` +
          `_"lunch nasi lemak with steamed fish"_\n\n` +
          `我会分析GI指数、血糖影响和代谢效果！💪`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "/today": {
      const meals = getTodaysMeals();
      const day = getCurrentDay();
      if (!meals.length) {
        await bot.sendMessage(chatId, `📋 第 ${day} 天 — 今天还没有记录餐点。`);
        return;
      }
      const list = meals.map((m, i) => `${i + 1}. [${m.time}] ${m.mealType}: ${m.description.slice(0, 60)}`).join("\n");
      await bot.sendMessage(chatId, `📋 *第 ${day} 天餐点记录*\n\n${list}`, { parse_mode: "Markdown" });
      break;
    }

    case "/summary": {
      const meals = getTodaysMeals();
      const day = getCurrentDay();
      if (!meals.length) {
        await bot.sendMessage(chatId, "没有餐点记录，无法生成总结。");
        return;
      }
      await bot.sendChatAction(chatId, "typing");
      const mealList = meals.map((m) => `${m.mealType}: ${m.description}`);
      const summary = await generateDailySummary(mealList, day, config.programme.clientName);
      const date = dayjs().format("YYYY-MM-DD");
      logDailySummary({ day, date, summary, totalMeals: meals.length }).catch(console.error);
      updateProgress({ day, date, mealsLogged: meals.length }).catch(console.error);
      await bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
      break;
    }

    case "/status": {
      const state = getState();
      const day = state.currentDay;
      const remaining = config.programme.days - day;
      await bot.sendMessage(
        chatId,
        `📊 *Programme Status*\n\n` +
          `📅 Day: ${day}/${config.programme.days}\n` +
          `⏳ Remaining: ${remaining} days\n` +
          `🍽 Today's meals: ${state.todaysMeals.length}\n` +
          `🗓 Start date: ${state.startDate || "Not started"}`,
        { parse_mode: "Markdown" }
      );
      break;
    }

    case "/help": {
      await bot.sendMessage(
        chatId,
        `🤖 *AI 健康助理指令*\n\n` +
          `/start30days — 开始30天计划\n` +
          `/today — 今日餐点列表\n` +
          `/summary — 生成今日健康总结\n` +
          `/status — 查看计划进度\n` +
          `/help — 显示此帮助\n\n` +
          `💡 *记录餐点：* 直接发送餐点内容即可！\n` +
          `例如：_"午餐 吃了鸡胸肉沙拉"_`,
        { parse_mode: "Markdown" }
      );
      break;
    }
  }
}

module.exports = { handleMessage };
