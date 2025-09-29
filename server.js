const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fetch = require('node-fetch');
const Tesseract = require('tesseract.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database(':memory:');

// 初始化数据库
db.serialize(() => {
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)");
});

app.use(bodyParser.json());
app.use(express.static('public'));

// 用户注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const hashed = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed], function(err) {
    if (err) return res.status(500).json({ error: '用户已存在或数据库错误' });
    res.json({ success: true });
  });
});

// 用户登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (!row) return res.status(400).json({ error: '用户不存在' });
    if (!bcrypt.compareSync(password, row.password)) return res.status(400).json({ error: '密码错误' });
    res.json({ success: true });
  });
});

// 文件上传配置，改为内存存储
const upload = multer({ storage: multer.memoryStorage() });

// OCR + Gemini 翻译接口
app.post('/api/translate', upload.single('image'), async (req, res) => {
  try {
    const { mode, apiKey } = req.body;
    const base64Image = req.file.buffer.toString('base64'); // 获取图片的base64编码

    // OCR 提取文字
    const result = await Tesseract.recognize(base64Image, 'jpn', { logger: m => console.log(m) });
    const text = result.data.text;

    let translated = "";
    if (mode === "gemini") {
      // 使用 Gemini API 进行翻译
      const response = await fetch("https://api.gemini.com/v1/translate", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source_language: 'ja',
          target_language: 'zh',
          text: text
        })
      });

      const data = await response.json();
      translated = data.translated_text || "翻译失败";
    }

    res.json({ original: text, translated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
