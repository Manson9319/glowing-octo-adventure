const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const SYSTEM_PROMPT = `你是 Chloe 的 AI 健康助理，专注于30天代谢率提升和血糖管理饮食计划。

你的专长：
- 低GI食物识别与分析（GI < 55 为低GI）
- 代谢率优化（蛋白质、纤维、餐次时间）
- 血糖管理（避免血糖快速波动）
- 水分摄取对代谢的影响
- 运动与代谢率的关系
- 睡眠质量对血糖和代谢的影响
- 马来西亚/亚洲饮食的健康替代建议

回复风格：简洁友好，中英文混合（Manglish风格可以），像朋友聊天。
导师 Anniisa 也在群组里，她可能补充专业意见。`;

let genAI = null;

function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  return genAI;
}

function getModel() {
  return getClient().getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: SYSTEM_PROMPT,
  });
}

// ── Meal: text only ──────────────────────────────────────────────────────────
async function analyzeMeal(mealDescription, context = {}) {
  const { day, previousMeals, clientName } = context;
  const dayInfo = day ? `这是 ${clientName || "Chloe"} 第 ${day}/30 天的记录。` : "";
  const prevContext = previousMeals?.length
    ? `今天之前的餐点：${previousMeals.join(", ")}`
    : "";

  const prompt = [
    dayInfo,
    prevContext,
    `餐点记录：${mealDescription}`,
    `请分析：
1. 🍽 餐点摘要（食物 + 估计份量）
2. 📊 GI评分（低/中/高）+ 简短说明
3. 🔥 代谢影响
4. 🩸 血糖影响
5. ✅ 改善建议（1-2条）`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// ── Meal: photo via Gemini Vision ────────────────────────────────────────────
async function analyzeMealPhoto(imageBuffer, caption, context = {}) {
  const { day, previousMeals, clientName } = context;
  const dayInfo = day ? `这是 ${clientName || "Chloe"} 第 ${day}/30 天的记录。` : "";
  const prevContext = previousMeals?.length
    ? `今天之前的餐点：${previousMeals.join(", ")}`
    : "";
  const captionNote = caption ? `附注说明：${caption}` : "";

  const textPart = [
    dayInfo,
    prevContext,
    captionNote,
    `请根据照片分析这份餐点：
1. 🍽 识别食物（名称 + 估计份量）
2. 📊 GI评分（低/中/高）+ 说明
3. 🔥 代谢影响
4. 🩸 血糖影响
5. ✅ 改善建议（1-2条）
如果照片不清晰或不是食物，请说明。`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await getModel().generateContent([
    { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } },
    textPart,
  ]);
  return result.response.text();
}

// ── Water ────────────────────────────────────────────────────────────────────
async function analyzeWater(text, context = {}) {
  const { day, totalWaterMl, clientName } = context;
  const goal = 2500;
  const remaining = Math.max(0, goal - (totalWaterMl || 0));

  const prompt = `${clientName || "Chloe"} 第 ${day || "?"}/30 天水分记录：
"${text}"
今天目前累计水分：${totalWaterMl || 0}ml，目标 ${goal}ml，还需 ${remaining}ml。

请回复（2-3行）：
💧 记录了多少水分（ml）
📊 今日水分进度
💡 一句话提示（水分对代谢/血糖的好处）`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// ── Exercise ─────────────────────────────────────────────────────────────────
async function analyzeExercise(text, context = {}) {
  const { day, clientName } = context;

  const prompt = `${clientName || "Chloe"} 第 ${day || "?"}/30 天运动记录：
"${text}"

请回复（3-4行）：
🏃 运动类型 + 时长
🔥 预估消耗热量（大概范围）
📈 对代谢率的影响（提升持续时间？）
🩸 对血糖的影响（运动前后注意事项）`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// ── Sleep ────────────────────────────────────────────────────────────────────
async function analyzeSleep(text, context = {}) {
  const { day, clientName } = context;

  const prompt = `${clientName || "Chloe"} 第 ${day || "?"}/30 天睡眠记录：
"${text}"

请回复（3-4行）：
😴 睡眠时长 + 质量评估
🔥 睡眠对明日代谢率的影响
🩸 睡眠对血糖调节的关系
💡 改善睡眠质量的小建议（如适用）`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// ── Daily summary (all 4 data types) ────────────────────────────────────────
async function generateDailySummary(dayData, day, clientName) {
  const { meals = [], waterMl = 0, exercises = [], sleep = null } = dayData;

  const mealLines = meals.map((m, i) => `  ${i + 1}. ${m}`).join("\n") || "  (无记录)";
  const exerciseLines = exercises.join(", ") || "未记录";
  const sleepLine = sleep ? `${sleep.hours}小时，质量：${sleep.quality}` : "未记录";

  const prompt = `请为 ${clientName} 第 ${day}/30 天生成完整健康总结：

🍽 今日餐点：
${mealLines}
💧 水分摄取：${waterMl}ml（目标2500ml）
🏃 运动：${exerciseLines}
😴 睡眠：${sleepLine}

总结格式：
📅 第 ${day} 天健康总结
🏆 今日亮点
⚠️ 需要改善
💡 明日重点
📈 整体评分与激励语`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// ── Weekly report ────────────────────────────────────────────────────────────
async function generateWeeklyReport(weekData, weekNumber, clientName) {
  const prompt = `为 ${clientName} 生成第 ${weekNumber} 周健康报告（30天计划）。

本周数据摘要：
${JSON.stringify(weekData, null, 2)}

请提供：
📊 第 ${weekNumber} 周周报
- GI饮食趋势
- 水分达标率
- 运动规律性
- 睡眠质量趋势
- 代谢率改善迹象
- 下周重点目标`;

  const result = await getModel().generateContent(prompt);
  return result.response.text();
}

// ── Progress report (7-day or 14-day) ───────────────────────────────────────
async function generateProgressReport(days, data, clientName, mentorName) {
  // Aggregate statistics
  const totalDays = data.length;
  const daysWithMeals = data.filter((d) => d.mealsLogged > 0).length;
  const daysWithExercise = data.filter((d) => d.exerciseSessions > 0).length;
  const daysWithSleep = data.filter((d) => d.sleepHours > 0).length;

  const avgWater = totalDays
    ? Math.round(data.reduce((s, d) => s + (d.waterMl || 0), 0) / totalDays)
    : 0;
  const avgSleep = daysWithSleep
    ? parseFloat((data.filter((d) => d.sleepHours > 0).reduce((s, d) => s + d.sleepHours, 0) / daysWithSleep).toFixed(1))
    : 0;
  const avgMeals = totalDays
    ? parseFloat((data.reduce((s, d) => s + d.mealsLogged, 0) / totalDays).toFixed(1))
    : 0;

  // GI breakdown
  const allMeals = data.flatMap((d) => d.meals || []);
  const giCounts = { Low: 0, Medium: 0, High: 0, "N/A": 0 };
  for (const m of allMeals) giCounts[m.giScore] = (giCounts[m.giScore] || 0) + 1;
  const totalMealsWithGI = allMeals.filter((m) => m.giScore !== "N/A").length || 1;
  const lowGIPct = Math.round((giCounts.Low / totalMealsWithGI) * 100);

  // Sleep quality
  const sleepRows = data.flatMap((d) => (d.sleep ? [d.sleep] : []));
  const goodSleepDays = sleepRows.filter((s) => s.quality === "Good").length;
  const poorSleepDays = sleepRows.filter((s) => s.quality === "Poor").length;

  // Engagement (mental state proxy)
  const loggingRate = Math.round((daysWithMeals / days) * 100);
  const exerciseRate = Math.round((daysWithExercise / days) * 100);
  const waterGoalDays = data.filter((d) => (d.waterMl || 0) >= 2500).length;

  // Water trend (first half vs second half)
  const half = Math.ceil(totalDays / 2);
  const firstHalfWater = data.slice(0, half).reduce((s, d) => s + (d.waterMl || 0), 0) / half;
  const secondHalfWater = data.slice(half).reduce((s, d) => s + (d.waterMl || 0), 0) / (totalDays - half || 1);
  const waterTrend = secondHalfWater > firstHalfWater + 100 ? "上升📈" : secondHalfWater < firstHalfWater - 100 ? "下降📉" : "稳定➡️";

  // Daily detail string (compact)
  const dailyDetail = data
    .map((d) => {
      const sleepStr = d.sleep ? `${d.sleep.hours}h(${d.sleep.quality})` : "无";
      return `Day${d.day}[${d.date}]: 餐${d.mealsLogged}次 水${d.waterMl}ml 运动${d.exerciseSessions}次 睡眠${sleepStr}`;
    })
    .join("\n");

  // Exercise details
  const exerciseList = data
    .filter((d) => d.exercises?.length)
    .flatMap((d) => d.exercises.map((e) => `${e.type}${e.durationMin ? `(${e.durationMin}min)` : ""}`))
    .join(", ") || "无记录";

  const reportType = `${days}天`;
  const dateRange = data.length
    ? `${data[0].date} 至 ${data[data.length - 1].date}`
    : `最近${days}天`;

  const prompt = `你是一位专业的营养师兼健康教练，正在为学员 ${clientName} 撰写${reportType}健康进度报告，供导师 ${mentorName || "Anniisa"} 参考。

━━━━ 原始统计数据 ━━━━
📅 报告期间：${dateRange}（共${totalDays}天有记录）
📊 记录率：${daysWithMeals}/${days}天有餐饮记录（${loggingRate}%）

【饮食数据】
- 平均每日餐次：${avgMeals} 次
- 低GI餐点比例：${lowGIPct}%（低GI:${giCounts.Low} 中GI:${giCounts.Medium} 高GI:${giCounts.High}）
- 照片记录餐点：${allMeals.filter((m) => m.hasPhoto).length} 次

【水分数据】
- 平均每日摄取：${avgWater}ml（目标2500ml）
- 达标天数：${waterGoalDays}/${days}天
- 趋势：${waterTrend}

【运动数据】
- 运动天数：${daysWithExercise}/${days}天（${exerciseRate}%）
- 运动内容：${exerciseList}

【睡眠数据】
- 平均睡眠：${avgSleep}小时
- 有记录天数：${daysWithSleep}/${days}天
- 好眠：${goodSleepDays}天 / 差眠：${poorSleepDays}天

【每日明细】
${dailyDetail}

━━━━ 报告格式要求 ━━━━
请用专业但温暖的语气，以中文为主，生成以下格式的${reportType}进度报告：

═══════════════════════════════
📋 ${clientName} ${reportType}健康进度报告
📅 ${dateRange}
导师：${mentorName || "Anniisa"} | AI助理分析
═══════════════════════════════

【一】饮食营养均衡 & 分量分析
- 整体评级（优/良/中/待改善）
- GI指数分布解读
- 营养均衡性评估（蛋白质、膳食纤维、碳水化合物）
- 分量控制观察
- 具体改善方向

【二】饮水量分析
- 整体评级
- 平均摄取量 vs 目标达成率
- 水分对本阶段代谢的影响分析
- 趋势评语与建议

【三】睡眠分析
- 整体评级
- 平均睡眠时长 & 质量评估
- 睡眠不足对血糖和代谢的具体影响
- 改善建议

【四】运动分析
- 整体评级
- 运动规律性与多样性
- 对代谢率提升的贡献评估
- 下阶段运动建议

【五】精神状态 & 执行力分析
（根据记录规律性、食物选择、运动坚持度综合推断）
- 整体参与度评估
- 动力曲线分析
- 心理支持建议

【六】综合总结
- 本${reportType}最大亮点（3条）
- 需要重点改善事项（3条）
- 下阶段（接下来${days}天）具体行动计划

【七】导师 ${mentorName || "Anniisa"} 建议栏
（预留空白，供导师手动补充专业意见）
___________________________________
___________________________________
___________________________________

评分总览：
🍽 饮食: ___/10  💧 水分: ___/10  😴 睡眠: ___/10  🏃 运动: ___/10  🧠 状态: ___/10
综合评分: ___/10

保持专业、数据驱动、有温度、给予鼓励。`;

  const reportModel = getClient().getGenerativeModel({ model: config.gemini.model });
  const result = await reportModel.generateContent(prompt);
  return result.response.text();
}

module.exports = {
  analyzeMeal,
  analyzeMealPhoto,
  analyzeWater,
  analyzeExercise,
  analyzeSleep,
  generateDailySummary,
  generateWeeklyReport,
  generateProgressReport,
};
