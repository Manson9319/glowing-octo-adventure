const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");

const SYSTEM_PROMPT = `你是 Chloe 的 AI 健康助理，专注于30天代谢率提升和血糖管理饮食计划。

你的专长：
- 低GI食物选择与搭配（GI < 55 为低GI）
- 代谢率优化（蛋白质、纤维、餐次时间）
- 血糖管理（避免血糖快速波动）
- 马来西亚/亚洲饮食的健康替代建议

分析每餐时，请提供：
1. 🍽 餐点摘要（食物 + 估计份量）
2. 📊 GI评分（低/中/高）+ 简短说明
3. 🔥 代谢影响（对代谢率的帮助或注意事项）
4. 🩸 血糖影响（预测血糖反应）
5. ✅ 今日建议（1-2条具体改善建议）

保持回复简洁友好，用中文+英文混合（Manglish风格可以），像朋友聊天一样。
导师 Anniisa 也在群组里，她可能会补充专业意见。`;

let genAI = null;

function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  return genAI;
}

async function analyzeMeal(mealDescription, context = {}) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: SYSTEM_PROMPT,
  });

  const { day, previousMeals, clientName } = context;
  const dayInfo = day ? `这是 ${clientName || "Chloe"} 第 ${day}/30 天的记录。` : "";
  const prevContext = previousMeals?.length
    ? `今天之前的餐点：${previousMeals.join(", ")}`
    : "";

  const prompt = [dayInfo, prevContext, `餐点记录：${mealDescription}`]
    .filter(Boolean)
    .join("\n");

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateDailySummary(dayMeals, day, clientName) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: SYSTEM_PROMPT,
  });

  const prompt = `请为 ${clientName} 第 ${day}/30 天生成每日健康总结：

今日所有餐点：
${dayMeals.map((m, i) => `${i + 1}. ${m}`).join("\n")}

总结格式：
📅 第 ${day} 天总结
🏆 今日亮点
⚠️ 需要改善
💡 明日建议
📈 进展评语（激励性语言）`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateWeeklyReport(weekMeals, weekNumber, clientName) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: SYSTEM_PROMPT,
  });

  const prompt = `为 ${clientName} 生成第 ${weekNumber} 周健康报告（共30天计划中的第 ${weekNumber} 周）。

本周饮食数据：
${weekMeals.join("\n")}

请提供：
📊 第 ${weekNumber} 周周报
- 整体GI评分趋势
- 代谢率改善迹象
- 血糖稳定性评估
- 下周重点目标`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { analyzeMeal, generateDailySummary, generateWeeklyReport };
