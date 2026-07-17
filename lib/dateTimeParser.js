const WEEKDAY_MAP = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const RELATIVE_DAY_WORDS = [
  ["大前天", -3],
  ["前天", -2],
  ["昨天", -1],
  ["昨日", -1],
  ["今天", 0],
  ["今日", 0],
];

function getTaipeiDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * 從訊息開頭解析日期時間前綴（例如「昨天下午2:00」「週一 14:30」「7/10」），
 * 回傳解析出的 Asia/Taipei 當地時間字串與移除前綴後的剩餘文字。
 * 若訊息開頭沒有日期前綴，date 回傳 null，remainingText 為原始文字。
 * @param {string} text
 * @param {Date} referenceDate 用來計算「今天/昨天」等相對日期的基準時間，預設現在
 * @returns {{ date: string|null, remainingText: string }} date 格式為 "YYYY-MM-DD HH:mm:ss"
 */
function parseDateTimePrefix(text, referenceDate = new Date()) {
  let remaining = text;
  const { year: refYear, month: refMonth, day: refDay } = getTaipeiDateParts(referenceDate);
  const refUtcDay = Date.UTC(refYear, refMonth - 1, refDay);

  let targetUtcDay = null;

  // 1. 明確日期：M/D 或 M月D日
  const explicitMatch = remaining.match(/^(\d{1,2})[/月](\d{1,2})日?\s*/);
  if (explicitMatch) {
    const month = parseInt(explicitMatch[1], 10);
    const day = parseInt(explicitMatch[2], 10);
    let candidate = Date.UTC(refYear, month - 1, day);
    if (candidate > refUtcDay) {
      candidate = Date.UTC(refYear - 1, month - 1, day);
    }
    targetUtcDay = candidate;
    remaining = remaining.slice(explicitMatch[0].length);
  } else {
    // 2. 今天/昨天/前天/大前天
    for (const [word, offset] of RELATIVE_DAY_WORDS) {
      if (remaining.startsWith(word)) {
        targetUtcDay = refUtcDay + offset * 86400000;
        remaining = remaining.slice(word.length);
        break;
      }
    }

    // 3. 星期幾/週幾/禮拜幾（最近一次，含今天，往前算七天內）
    if (targetUtcDay === null) {
      const weekdayMatch = remaining.match(/^(星期|週|周|禮拜)(一|二|三|四|五|六|日|天)/);
      if (weekdayMatch) {
        const targetDow = WEEKDAY_MAP[weekdayMatch[2]];
        const refDow = new Date(refUtcDay).getUTCDay();
        const diff = (refDow - targetDow + 7) % 7;
        targetUtcDay = refUtcDay - diff * 86400000;
        remaining = remaining.slice(weekdayMatch[0].length);
      }
    }
  }

  if (targetUtcDay === null) {
    return { date: null, remainingText: text };
  }

  remaining = remaining.trimStart();

  // 時間部分：上午/下午/晚上/凌晨/中午 + 時:分 或 時點分
  let hour = 12;
  let minute = 0;

  const timeMatch = remaining.match(/^(上午|下午|晚上|凌晨|中午)?\s*(\d{1,2})[:點時](\d{1,2})?分?\s*/);
  if (timeMatch) {
    let h = parseInt(timeMatch[2], 10);
    const min = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const period = timeMatch[1];
    if ((period === "下午" || period === "晚上") && h < 12) h += 12;
    if (period === "中午" && h < 12) h = 12;
    if ((period === "上午" || period === "凌晨") && h === 12) h = 0;
    hour = h;
    minute = min;
    remaining = remaining.slice(timeMatch[0].length).trimStart();
  } else {
    const periodOnlyMatch = remaining.match(/^(上午|下午|晚上|凌晨|中午)\s*/);
    if (periodOnlyMatch) {
      const period = periodOnlyMatch[1];
      hour = { 上午: 9, 下午: 15, 晚上: 20, 凌晨: 3, 中午: 12 }[period];
      remaining = remaining.slice(periodOnlyMatch[0].length).trimStart();
    }
  }

  const target = new Date(targetUtcDay);
  const dateStr = `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(target.getUTCDate())} ${pad2(hour)}:${pad2(minute)}:00`;

  return { date: dateStr, remainingText: remaining };
}

module.exports = { parseDateTimePrefix };
