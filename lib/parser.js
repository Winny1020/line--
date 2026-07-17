const { parseDateTimePrefix } = require("./dateTimeParser");

const CATEGORY_KEYWORDS = {
  餐飲: ["早餐", "午餐", "晚餐", "消夜", "宵夜", "飲料", "咖啡", "便當", "聚餐", "零食", "手搖", "吃", "喝"],
  交通: ["公車", "捷運", "計程車", "uber", "加油", "停車", "高鐵", "火車", "機票", "悠遊卡", "油錢"],
  購物: ["衣服", "鞋", "包包", "購物", "3c", "電器", "網購"],
  娛樂: ["電影", "遊戲", "唱歌", "ktv", "旅遊", "展覽", "訂閱", "netflix", "門票"],
  居家: ["房租", "水電", "瓦斯", "網路費", "管理費", "家具", "日用品"],
  醫療: ["醫院", "藥", "看診", "牙醫", "健檢", "掛號"],
};

function guessCategory(text) {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return category;
    }
  }
  return "其他";
}

/**
 * 解析使用者輸入的記帳訊息。
 * 支援格式："項目 金額"、"金額 項目"、"項目 金額 #分類"，開頭加 "+" 代表收入。
 * 開頭可加日期時間前綴（例如「昨天下午2:00」「週一 14:30」「7/10」）補記過去的帳務。
 * @param {string} rawText
 * @param {(item: string) => string} [resolveCategory] 無 #分類 標籤時用來決定分類的函式，預設用內建關鍵字判斷
 * @param {Date} [referenceDate] 用來計算「今天/昨天」等相對日期的基準時間，預設現在
 * @returns {{type: '支出'|'收入', category: string, item: string, amount: number, recordedAt: string|null} | null}
 */
function parseExpenseMessage(rawText, resolveCategory = guessCategory, referenceDate = new Date()) {
  let text = rawText.trim();
  if (!text) return null;

  const { date: recordedAt, remainingText } = parseDateTimePrefix(text, referenceDate);
  text = remainingText.trim();
  if (!text) return null;

  const type = text.startsWith("+") ? "收入" : "支出";
  if (text.startsWith("+")) text = text.slice(1).trim();

  const tagMatch = text.match(/#(\S+)/);
  const explicitCategory = tagMatch ? tagMatch[1] : null;
  if (tagMatch) text = text.replace(tagMatch[0], "").trim();

  const amountMatch = text.match(/\d+(\.\d+)?/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[0]);
  if (Number.isNaN(amount) || amount <= 0) return null;

  const item = text.replace(amountMatch[0], "").trim() || "未命名項目";
  const category = explicitCategory || resolveCategory(item);

  return { type, category, item, amount, recordedAt };
}

module.exports = { parseExpenseMessage, guessCategory, CATEGORY_KEYWORDS };
