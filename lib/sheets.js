const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || "記帳";
const HEADER = ["日期時間", "類型", "分類", "項目", "金額", "UserId", "星期"];
const WEEKDAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

let sheetsClientPromise = null;

function getSheetsClient() {
  if (!sheetsClientPromise) {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClientPromise = auth.authorize().then(() => google.sheets({ version: "v4", auth }));
  }
  return sheetsClientPromise;
}

async function ensureHeader(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:G1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:G1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
  }
}

function formatTaipeiTimestamp(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

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

function toDateStr(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function getWeekdayLabel(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_NAMES[dow];
}

const PERIODS = ["week", "month", "quarter", "year"];

function getPeriodRange(period, referenceDate = new Date()) {
  if (!PERIODS.includes(period)) {
    throw new Error(`未知的統計區間: ${period}`);
  }
  const { year, month, day } = getTaipeiDateParts(referenceDate);
  const today = new Date(Date.UTC(year, month - 1, day));

  if (period === "week") {
    const dow = today.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = (dow + 6) % 7;
    const start = new Date(today.getTime() - diffToMonday * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    return { label: `${toDateStr(start)} ~ ${toDateStr(end)}`, start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "month") {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return { label: `${year}-${pad2(month)}`, start: toDateStr(start), end: toDateStr(end) };
  }
  if (period === "quarter") {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    return { label: `${year} Q${quarter}`, start: toDateStr(start), end: toDateStr(end) };
  }
  // year
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return { label: `${year}`, start: toDateStr(start), end: toDateStr(end) };
}

async function appendExpense({ type, category, item, amount, userId }) {
  const sheets = await getSheetsClient();
  await ensureHeader(sheets);
  const timestamp = formatTaipeiTimestamp(new Date());
  const weekday = getWeekdayLabel(timestamp);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[timestamp, type, category, item, amount, userId, weekday]] },
  });
  return { timestamp };
}

async function getAllRows() {
  const sheets = await getSheetsClient();
  await ensureHeader(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:G`,
  });
  return res.data.values || [];
}

async function getSummary(userId, period, referenceDate = new Date()) {
  const { label, start, end } = getPeriodRange(period, referenceDate);
  const rows = await getAllRows();
  const summary = {};
  let totalExpense = 0;
  let totalIncome = 0;

  for (const row of rows) {
    const [timestamp, type, category, , amountStr, rowUserId] = row;
    if (rowUserId !== userId || !timestamp) continue;
    const dateStr = timestamp.slice(0, 10);
    if (dateStr < start || dateStr > end) continue;
    const amount = parseFloat(amountStr) || 0;
    if (type === "收入") {
      totalIncome += amount;
    } else {
      totalExpense += amount;
      summary[category] = (summary[category] || 0) + amount;
    }
  }

  return { period, label, summary, totalExpense, totalIncome };
}

async function getItemCategoryHistory(userId) {
  const rows = await getAllRows();
  const counts = new Map();

  for (const row of rows) {
    const [, type, category, item, , rowUserId] = row;
    if (rowUserId !== userId || type === "收入" || !item || !category) continue;
    const key = item.trim().toLowerCase();
    if (!counts.has(key)) counts.set(key, new Map());
    const categoryCounts = counts.get(key);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  const history = new Map();
  for (const [item, categoryCounts] of counts) {
    const [bestCategory] = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    history.set(item, bestCategory);
  }
  return history;
}

async function deleteLastExpense(userId) {
  const sheets = await getSheetsClient();
  await ensureHeader(sheets);
  const rows = await getAllRows();

  let lastIndex = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i][5] === userId) {
      lastIndex = i;
      break;
    }
  }
  if (lastIndex === -1) return null;

  const deletedRow = rows[lastIndex];
  const sheetRowNumber = lastIndex + 2; // +1 for header, +1 for 1-indexing

  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = metadata.data.sheets.find((s) => s.properties.title === SHEET_NAME);
  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: sheetRowNumber - 1,
              endIndex: sheetRowNumber,
            },
          },
        },
      ],
    },
  });

  return deletedRow;
}

module.exports = { appendExpense, getSummary, deleteLastExpense, getItemCategoryHistory, getWeekdayLabel };
