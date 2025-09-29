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

// 文件上传配置
const upload = multer({ dest: 'uploads/' });

// OCR + 翻译接口
app.post('/api/translate', upload.single('image'), async (req, res) => {
  try {
    const { mode, apiKey } = req.body;
    const imagePath = req.file.path;

    // OCR 提取文字
    const result = await Tesseract.recognize(imagePath, 'jpn');
    const text = result.data.text;

    let translated = "";
    if (mode === "free") {
      // 免费翻译 API (Hugging Face NLLB)
      const response = await fetch("https://api-inference.huggingface.co/models/facebook/nllb-200-distilled-600M", {
        method: "POST",
        headers: { "Authorization": "Bearer hf_xxx", "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: text })
      });
      const data = await response.json();
      translated = data[0]?.translation_text || "翻译失败";
    } else if (mode === "gpt") {
      // GPT 翻译
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: `把下面的日语翻译成中文：\n${text}` }]
        })
      });
      const data = await response.json();
      translated = data.choices[0].message.content;
    }

    res.json({ original: text, translated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
