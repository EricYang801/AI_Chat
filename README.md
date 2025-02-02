# AI 對話 Web
本專案由 Claude 3.5 Sonnect 開發，本人極少量除錯。

## 專案簡介
本專案為基於 OpenAI API 開發的互動式對話網頁應用，提供即時對話、照片處理及自訂提示詞等。

## 範例影片

[Watch the Video](https://youtu.be/I0oBDpEDGzM)

## 主要功能

### 對話功能
- 💬 OpenAI API 即時回覆
- 📝 Markdown 格式支援
- 🔄 多輪對話記憶功能
- 💻 程式碼語法高亮顯示

### 系統特色
- 🖼️ 圖片處理與分析
- 📂 多重對話管理 
- 🌙 深色模式支援
- ⚙️ 自訂系統提示詞

## 技術規格

### 環境需求
- Python 3.10+
- Node.js 18+
- OpenAI API

### 安裝步驟
1. 複製專案
```bash
git clone https://github.com/yourusername/ai-chat-assistant.git
cd ai-chat-assistant
```

2. 安裝相依套件
```bash
pip install -r requirements.txt
npm install
```

3. 環境設定
```bash
# 建立 .env 檔案並設定以下參數
OPENAI_API_KEY=你的_OpenAI_API_金鑰
FLASK_SECRET_KEY=你的隨機密鑰
```

4. 啟動系統
```bash
python app.py
```

## 使用說明
1. 開啟瀏覽器訪問 http://localhost:3000
2. 開始對話

## 注意事項
- 📤 檔案上傳限制：16MB
- 🖼️ 支援格式：PNG、JPG、JPEG、GIF
- 🌐 需要穩定網路連線

## 授權
本專案採用 MIT 授權條款
