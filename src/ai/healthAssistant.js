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

module.exports = {
  analyzeMeal,
  analyzeMealPhoto,
  analyzeWater,
  analyzeExercise,
  analyzeSleep,
  generateDailySummary,
  generateWeeklyReport,
};
