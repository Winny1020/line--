# LINE 記帳機器人

在 LINE 聊天室輸入一句話就能記帳，資料自動寫入 Google Sheets。

## 目前正式環境

- **LINE 官方帳號**：Winny 記帳小幫手（`@844nkred`）
- **正式伺服器**：Render 雲端部署，網址 `https://line-winny-line-bot.onrender.com`
- **程式碼倉庫**：https://github.com/Winny1020/line--（`main` 分支推送後 Render 會自動重新部署）
- **方案**：Render Free 方案 — 閒置一段時間會自動休眠，下次收到訊息時可能延遲最多 50 秒才回覆屬正常現象；若需要秒回可考慮升級付費方案（$7/月起）

## 使用方式（設定完成後）

```
早餐 60          → 記一筆支出，分類自動判斷為「餐飲」
60 早餐          → 效果同上，項目與金額順序不拘
加油 300 #交通   → 手動指定分類
+5000 薪水       → 記一筆收入
本週 / 本月 / 本季 / 本年 → 查詢對應區間的分類支出與收支總計
刪除             → 刪除自己最後一筆紀錄
說明             → 顯示使用說明
```

多筆記帳可在同一則訊息裡換行輸入，機器人會逐行各自記錄一筆。

---

## 一、申請 LINE Messaging API Channel

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)，用你的 LINE 帳號登入。
2. 建立一個 Provider（若沒有的話），輸入名稱後建立。
3. 在該 Provider 下建立一個 Channel，類型選擇 **Messaging API**。
4. 填寫 Channel 名稱、說明、分類等基本資料，建立完成。
5. 進入該 Channel，切到 **Messaging API** 分頁：
   - 找到 **Channel access token**，按「Issue」產生，複製起來（對應 `.env` 的 `LINE_CHANNEL_ACCESS_TOKEN`）。
   - 切到 **Basic settings** 分頁，複製 **Channel secret**（對應 `.env` 的 `LINE_CHANNEL_SECRET`）。
6. 把 **Webhook URL** 填入正式環境網址：`https://line-winny-line-bot.onrender.com/webhook`，並開啟 **Use webhook**。
7. 到 LINE Official Account Manager 後台（https://manager.line.biz/）的「回應設定」，把「聊天」關閉、「Webhook」開啟，避免內建自動回應攔截訊息。
8. 用手機掃描 Channel 頁面上的 QR Code，把這個機器人加為好友，之後就能在聊天室裡跟它對話。

## 二、建立 Google 服務帳戶並授權 Google Sheet

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，建立一個新專案（或使用現有專案）。
2. 在「API 和服務」啟用 **Google Sheets API**。
3. 到「IAM 與管理 > 服務帳戶」建立一個 Service Account（角色不用特別指定）。
4. 建立完成後，進入該服務帳戶，「金鑰」分頁 → 新增金鑰 → JSON，下載金鑰檔。
5. 打開下載的 JSON，取出：
   - `client_email` → 對應 `.env` 的 `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → 對應 `.env` 的 `GOOGLE_PRIVATE_KEY`（保留其中的 `\n`，整段用雙引號包起來貼上）
6. 開一個新的 Google Sheet 當作記帳本，把網址中 `/d/` 與 `/edit` 之間那段複製下來，填入 `.env` 的 `GOOGLE_SHEET_ID`。
7. 把這個 Google Sheet **共用給服務帳戶信箱**（就是 `client_email`），權限給「編輯者」。這一步很重要，沒有共用機器人會沒有權限寫入。
8. `.env` 的 `GOOGLE_SHEET_NAME` 預設是「記帳」，可改成你想要的工作表分頁名稱（若該分頁不存在請先在 Sheet 裡新增同名分頁）。

## 三、部署到 Render（正式環境）

1. 把專案程式碼推送到 GitHub（目前是 `Winny1020/line--`）。
2. 到 [Render Dashboard](https://dashboard.render.com/) 用 GitHub 帳號登入，點 **New +** → **Web Service**。
3. 選擇 **Build and deploy from a Git repository**，連接並選取這個 repo。
4. 設定：
   - **Branch**：`main`
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
   - **Instance Type**：Free
5. **Environment Variables** 區塊點 **Add from .env**，選擇本機的 `.env` 檔案，一次匯入六組變數（`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`、`GOOGLE_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_PRIVATE_KEY`、`GOOGLE_SHEET_ID`、`GOOGLE_SHEET_NAME`）。
6. 點 **Deploy Web Service**，等部署完成後會拿到一個 `https://xxxx.onrender.com` 網址。
7. 回到 LINE 後台把 Webhook URL 換成這個網址加上 `/webhook`。

之後每次 `git push` 到 `main` 分支，Render 會自動重新部署。

## 四、（選用）本機開發與除錯

想在本機修改程式並測試，可以用 ngrok 暫時對外提供服務，不影響 Render 上的正式環境（只要別把 LINE 的 Webhook URL 切回 ngrok 網址即可）：

```bash
cd line-記帳機器人
npm install
cp .env.example .env
# 打開 .env 填入六項金鑰/ID
npm start
```

另開一個終端機視窗：
```bash
ngrok http 3000
```

複製 ngrok 顯示的網址，若要暫時用它測試，記得測試完要把 LINE 後台的 Webhook URL 改回 Render 的正式網址。

> ngrok 免費版每次重啟網址都會變動，僅適合臨時除錯，不建議長期依賴。

## 檔案結構

```
line-記帳機器人/
├── index.js          # Express 伺服器與 LINE webhook 處理
├── lib/
│   ├── parser.js      # 解析訊息文字（金額、項目、分類）
│   └── sheets.js      # Google Sheets 讀寫（記帳、查詢、統計、刪除）
├── .env.example       # 環境變數範本
├── SPEC.md            # 完整規格書
└── package.json
```
