require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { parseExpenseMessage, guessCategory } = require("./lib/parser");
const { appendExpense, getSummary, deleteLastExpense, getItemCategoryHistory } = require("./lib/sheets");

const PERIOD_LABELS = { week: "本週", month: "本月", quarter: "本季", year: "本年" };

const PERIOD_COMMANDS = {
  本週: "week",
  週統計: "week",
  這週: "week",
  本月: "month",
  月統計: "month",
  統計: "month",
  查詢: "month",
  本季: "quarter",
  季統計: "quarter",
  本年: "year",
  年統計: "year",
  今年: "year",
};

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(lineConfig);
const app = express();

const HELP_TEXT = [
  "📒 記帳機器人使用說明",
  "",
  "記一筆支出：早餐 60　或　60 早餐",
  "多筆請一行一筆",
  "指定分類：加油 300 #交通",
  "記一筆收入：+5000 薪水",
  "查詢統計：本週／本月／本季／本年",
  "刪除上一筆：刪除",
  "",
  "分類會依關鍵字自動判斷，也可用 #分類 手動指定。",
  "同樣項目名稱之後會記住你上次選的分類，之後免標籤自動套用。",
].join("\n");

function formatSummary({ period, label, summary, totalExpense, totalIncome }) {
  const lines = [`📊 ${PERIOD_LABELS[period]}（${label}）記帳統計`, ""];
  const categories = Object.entries(summary).sort((a, b) => b[1] - a[1]);
  if (categories.length === 0) {
    lines.push("這段期間尚無支出紀錄");
  } else {
    for (const [category, amount] of categories) {
      lines.push(`${category}：${amount.toLocaleString()} 元`);
    }
  }
  lines.push("");
  lines.push(`支出總計：${totalExpense.toLocaleString()} 元`);
  if (totalIncome > 0) {
    lines.push(`收入總計：${totalIncome.toLocaleString()} 元`);
    lines.push(`結餘：${(totalIncome - totalExpense).toLocaleString()} 元`);
  }
  return lines.join("\n");
}

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();
  console.log(`收到訊息 [${userId}]: ${text}`);

  if (["說明", "help", "幫助"].includes(text.toLowerCase())) {
    return client.replyMessage(event.replyToken, { type: "text", text: HELP_TEXT });
  }

  if (PERIOD_COMMANDS[text]) {
    const result = await getSummary(userId, PERIOD_COMMANDS[text]);
    return client.replyMessage(event.replyToken, { type: "text", text: formatSummary(result) });
  }

  if (["刪除", "刪除上一筆", "undo"].includes(text.toLowerCase())) {
    const deleted = await deleteLastExpense(userId);
    const reply = deleted
      ? `🗑️ 已刪除：${deleted[3]} - ${deleted[4]} ${deleted[5]} 元`
      : "找不到可刪除的紀錄";
    return client.replyMessage(event.replyToken, { type: "text", text: reply });
  }

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const recorded = [];
  const unrecognized = [];

  const history = await getItemCategoryHistory(userId);
  const resolveCategory = (item) => history.get(item.trim().toLowerCase()) || guessCategory(item);

  for (const line of lines) {
    const parsed = parseExpenseMessage(line, resolveCategory);
    if (parsed) {
      await appendExpense({ ...parsed, userId });
      recorded.push(parsed);
    } else {
      unrecognized.push(line);
    }
  }

  if (recorded.length === 0) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "看不懂這筆紀錄 🤔\n請用「項目 金額」格式，例如：午餐 120\n多筆請一行一筆\n輸入「說明」查看完整用法",
    });
  }

  const replyLines = recorded.map((parsed) => {
    const emoji = parsed.type === "收入" ? "💰" : "✅";
    return `${emoji} ${parsed.type}：${parsed.category} - ${parsed.item} ${parsed.amount.toLocaleString()} 元`;
  });
  if (unrecognized.length > 0) {
    replyLines.push("", `⚠️ 看不懂以下 ${unrecognized.length} 行，未記錄：`, ...unrecognized);
  }
  return client.replyMessage(event.replyToken, { type: "text", text: replyLines.join("\n") });
}

app.post("/webhook", line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error("處理事件時發生錯誤:", err);
      res.status(500).end();
    });
});

app.get("/", (_req, res) => {
  res.send("LINE 記帳機器人運作中");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`伺服器已啟動，監聽埠號 ${port}`);
});
