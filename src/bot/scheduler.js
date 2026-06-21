const dayjs = require("dayjs");
const { generateDailySummary, generateWeeklyReport } = require("../ai/healthAssistant");
const { logDailySummary, logWeeklyReport, updateProgress } = require("../sheets/googleSheets");
const { getTodaysMeals, getCurrentDay, resetDayMeals, isActive } = require("./programmeState");
const config = require("../config");

// Simple cron-like scheduler using setInterval
function startScheduler(bot) {
  const groupChatId = config.telegram.groupChatId;

  setInterval(async () => {
    const now = dayjs();
    const hour = now.hour();
    const minute = now.minute();

    // Daily reminder at 07:30
    if (hour === 7 && minute === 30 && isActive()) {
      const day = getCurrentDay();
      await bot.sendMessage(
        groupChatId,
        `☀️ 早安 ${config.programme.clientName}！第 *${day}/${config.programme.days}* 天开始啦！\n\n` +
          `记得记录你的每一餐 — 早餐、午餐、晚餐和零食。\n` +
          `📝 直接发送餐点内容，AI助理会分析GI和代谢影响！`,
        { parse_mode: "Markdown" }
      );
    }

    // Lunch reminder at 12:00
    if (hour === 12 && minute === 0 && isActive()) {
      await bot.sendMessage(
        groupChatId,
        `🌞 午餐时间！记得记录你吃了什么 🍱\n今天选择低GI食物了吗？`
      );
    }

    // Evening check-in at 19:30
    if (hour === 19 && minute === 30 && isActive()) {
      await bot.sendMessage(
        groupChatId,
        `🌙 晚上好！记得记录晚餐。\n用 /summary 生成今日健康总结 📊`
      );
    }

    // Auto daily summary at 22:00
    if (hour === 22 && minute === 0 && isActive()) {
      const meals = getTodaysMeals();
      const day = getCurrentDay();
      const date = now.format("YYYY-MM-DD");

      if (meals.length > 0) {
        try {
          const mealList = meals.map((m) => `${m.mealType}: ${m.description}`);
          const summary = await generateDailySummary(mealList, day, config.programme.clientName);
          await bot.sendMessage(groupChatId, `📅 *自动每日总结*\n\n${summary}`, {
            parse_mode: "Markdown",
          });
          await logDailySummary({ day, date, summary, totalMeals: meals.length });
          await updateProgress({ day, date, mealsLogged: meals.length });
        } catch (err) {
          console.error("Daily summary error:", err.message);
        }
        resetDayMeals();
      }
    }

    // Weekly report every Sunday at 21:00
    const dayOfWeek = now.day(); // 0 = Sunday
    if (dayOfWeek === 0 && hour === 21 && minute === 0 && isActive()) {
      const day = getCurrentDay();
      const week = Math.ceil(day / 7);
      try {
        const report = await generateWeeklyReport([], week, config.programme.clientName);
        await bot.sendMessage(groupChatId, `📊 *第 ${week} 周健康报告*\n\n${report}`, {
          parse_mode: "Markdown",
        });
        const dateRange = `Week ${week}`;
        await logWeeklyReport({ week, dateRange, report });
      } catch (err) {
        console.error("Weekly report error:", err.message);
      }
    }
  }, 60 * 1000); // check every minute

  console.log("Scheduler started (checks every minute).");
}

module.exports = { startScheduler };
