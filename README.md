# LINE 記帳機器人

在 LINE 聊天室輸入一句話就能記帳，資料自動寫入 Google Sheets。

## 使用方式（設定完成後）

```
早餐 60          → 記一筆支出，分類自動判斷為「餐飲」
60 早餐          → 效果同上，項目與金額順序不拘
加油 300 #交通   → 手動指定分類
+5000 薪水       → 記一筆收入
統計 / 本月       → 查詢本月各分類支出與總計
刪除             → 刪除自己最後一筆紀錄
說明             → 顯示使用說明
```

---

## 一、申請 LINE Messaging API Channel

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)，用你的 LINE 帳號登入。
2. 建立一個 Provider（若沒有的話），輸入名稱後建立。
3. 在該 Provider 下建立一個 Channel，類型選擇 **Messaging API**。
4. 填寫 Channel 名稱、說明、分類等基本資料，建立完成。
5. 進入該 Channel，切到 **Messaging API** 分頁：
   - 找到 **Channel access token**，按「Issue」產生，複製起來（對應 `.env` 的 `LINE_CHANNEL_ACCESS_TOKEN`）。
   - 切到 **Basic settings** 分頁，複製 **Channel secret**（對應 `.env` 的 `LINE_CHANNEL_SECRET`）。
6. 回到 Messaging API 分頁，把 **Webhook 用のURL** 填入之後 ngrok 提供的網址（例如 `https://xxxx.ngrok-free.app/webhook`），並開啟 **Use webhook**。
7. 建議關閉「自動回應訊息」「加入好友的歡迎訊息」等預設功能（在 LINE Official Account Manager 後台，https://manager.line.biz/ 設定），避免跟機器人自己的回覆衝突。
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

## 三、安裝與本機啟動

```bash
cd line-記帳機器人
npm install
cp .env.example .env
# 打開 .env 填入上面取得的四項金鑰/ID
npm start
```

啟動後應該會看到 `伺服器已啟動，監聽埠號 3000`。

## 四、用 ngrok 讓 LINE 連得到本機

1. 安裝 ngrok（`brew install ngrok` 或到官網下載），並用 `ngrok config add-authtoken <你的token>` 設定好帳號（免費註冊 https://ngrok.com/ 取得 token）。
2. 開一個新的終端機視窗，執行：
   ```bash
   ngrok http 3000
   ```
3. 複製 ngrok 顯示的 `https://xxxx.ngrok-free.app` 網址。
4. 回到 LINE Developers Console 的 Messaging API 分頁，把 Webhook URL 設成 `https://xxxx.ngrok-free.app/webhook`，按「Verify」確認能連通（應顯示 Success）。

   > 注意：ngrok 免費版每次重啟網址都會變，改了之後要記得回 LINE 後台更新 Webhook URL。

5. 用手機打開跟機器人的聊天室，輸入 `午餐 120` 測試，應該會收到「✅ 已記錄 支出：餐飲 - 午餐 120 元」的回覆，同時 Google Sheet 會多一列資料。

## 之後要長期使用怎麼辦？

本機測試沒問題後，建議部署到 Render / Railway / Google Cloud Run 等平台常駐運作（不用一直開著電腦跟 ngrok），把同樣的環境變數設定上去、Webhook URL 換成正式網址即可。有需要的話可以再請我協助設定部署。

## 檔案結構

```
line-記帳機器人/
├── index.js          # Express 伺服器與 LINE webhook 處理
├── lib/
│   ├── parser.js      # 解析訊息文字（金額、項目、分類）
│   └── sheets.js      # Google Sheets 讀寫（記帳、查詢、刪除）
├── .env.example       # 環境變數範本
└── package.json
```
