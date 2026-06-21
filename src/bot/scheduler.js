const dayjs = require("dayjs");
const { generateDailySummary, generateWeeklyReport } = require("../ai/healthAssistant");
const { logDailySummary, logWeeklyReport, updateProgress } = require("../sheets/googleSheets");
const {
  getTodaysMeals, getTodaysWater, getTodaysExercises, getTodaysSleep,
  getCurrentDay, resetDay, isActive,
} = require("./programmeState");
const config = require("../config");

function startScheduler(bot) {
  const groupChatId = config.telegram.groupChatId;

  setInterval(async () => {
    if (!isActive()) return;

    const now = dayjs();
    const hour = now.hour();
    const minute = now.minute();
    const dayOfWeek = now.day(); // 0=Sun

    // 07:30 — Morning greeting + sleep reminder
    if (hour === 7 && minute === 30) {
      const day = getCurrentDay();
      const sleep = getTodaysSleep();
      const sleepNote = sleep
        ? `昨晚睡了 ${sleep.hours}h — ${sleep.quality === "Good" ? "睡得好！" : "注意好好休息哦。"}`
        : "别忘了记录昨晚的睡眠情况 😴";

      await bot.sendMessage(
        groupChatId,
        `☀️ 早安 ${config.programme.clientName}！*第 ${day}/${config.programme.days} 天*\n\n` +
        `${sleepNote}\n\n` +
        `今天目标：\n` +
        `🍽 记录每一餐（📸拍照 或文字）\n` +
        `💧 喝足 2500ml 水\n` +
        `🏃 至少 30 分钟运动\n\n` +
        `加油！Anniisa 导师和我都在这里支持你 💪`,
        { parse_mode: "Markdown" }
      );
    }

    // 10:00 — Water reminder
    if (hour === 10 && minute === 0) {
      const water = getTodaysWater();
      if (water < 500) {
        await bot.sendMessage(
          groupChatId,
          `💧 记得喝水！现在才 ${water}ml，目标 2500ml。\n` +
          `水分充足 → 代谢更快 → 血糖更稳定 🌊`
        );
      }
    }

    // 12:00 — Lunch reminder
    if (hour === 12 && minute === 0) {
      await bot.sendMessage(
        groupChatId,
        `🌞 午餐时间！记得记录你吃了什么 🍱\n` +
        `📸 拍张照片发给我，或文字描述都可以。\n` +
        `今天选择低GI食物了吗？`
      );
    }

    // 15:00 — Afternoon water + snack check
    if (hour === 15 && minute === 0) {
      const water = getTodaysWater();
      const pct = Math.round((water / 2500) * 100);
      await bot.sendMessage(
        groupChatId,
        `🕒 下午好！水分进度：${water}ml / 2500ml (${pct}%)\n` +
        `如果有下午茶/零食，记得记录哦 🍌\n` +
        `选择坚果、水果或低GI小食更好！`
      );
    }

    // 19:30 — Dinner + exercise reminder
    if (hour === 19 && minute === 30) {
      const exercises = getTodaysExercises();
      const exerciseNote = exercises.length
        ? `今天已完成 ${exercises.length} 次运动，太棒了！💪`
        : `今天还没有运动记录，饭后散步也算哦 🚶`;

      await bot.sendMessage(
        groupChatId,
        `🌙 晚上好！记得记录晚餐。\n` +
        `${exerciseNote}\n\n` +
        `用 /today 看今日全部记录 📊`
      );
    }

    // 22:00 — Auto daily summary
    if (hour === 22 && minute === 0) {
      const meals = getTodaysMeals();
      const water = getTodaysWater();
      const exercises = getTodaysExercises();
      const sleep = getTodaysSleep();
      const day = getCurrentDay();
      const date = now.format("YYYY-MM-DD");

      const hasAnyData = meals.length || water || exercises.length;
      if (hasAnyData) {
        try {
          const dayData = {
            meals: meals.map((m) => `${m.mealType}: ${m.description}`),
            waterMl: water,
            exercises,
            sleep,
          };
          const summary = await generateDailySummary(dayData, day, config.programme.clientName);
          await bot.sendMessage(groupChatId, `📅 *第 ${day} 天自动总结*\n\n${summary}`, {
            parse_mode: "Markdown",
          });
          await logDailySummary({
            day, date, summary,
            totalMeals: meals.length, totalWaterMl: water,
            totalExercises: exercises.length, sleepHours: sleep?.hours,
          });
          await updateProgress({
            day, date,
            mealsLogged: meals.length, waterMl: water,
            exerciseCount: exercises.length, sleepHours: sleep?.hours,
          });
        } catch (err) {
          console.error("Auto summary error:", err.message);
        }
      }

      // Sleep reminder
      await bot.sendMessage(
        groupChatId,
        `😴 准备休息了吗？记得记录今晚的睡眠时间！\n` +
        `"今晚睡觉了，sleep 10:30pm" 或 "计划睡8小时"`,
      );

      resetDay();
    }

    // Sunday 21:00 — Weekly report
    if (dayOfWeek === 0 && hour === 21 && minute === 0) {
      const day = getCurrentDay();
      const week = Math.ceil(day / 7);
      try {
        const report = await generateWeeklyReport({}, week, config.programme.clientName);
        await bot.sendMessage(groupChatId, `📊 *第 ${week} 周健康报告*\n\n${report}`, {
          parse_mode: "Markdown",
        });
        await logWeeklyReport({ week, dateRange: `Week ${week}`, report });
      } catch (err) {
        console.error("Weekly report error:", err.message);
      }
    }
  }, 60 * 1000);

  console.log("Scheduler started (checks every minute).");
}

module.exports = { startScheduler };
