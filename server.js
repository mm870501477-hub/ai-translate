const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const fetch = require("node-fetch");
const Tesseract = require("tesseract.js");

const app = express();
const upload = multer({ dest: "/tmp" }); // Vercel 支持 /tmp 临时目录

app.use(bodyParser.json());

// 测试根路由
app.get("/", (req, res) => {
  res.send("✅ AI Translate Server is running!");
});

// OCR + 翻译接口
app.post("/api/translate", upload.single("image"), async (req, res) => {
  try {
    const { mode, apiKey } = req.body;
    const imagePath = req.file.path;

    // OCR 提取文字
    const result = await Tesseract.recognize(imagePath, "jpn");
    const text = result.data.text.trim();

    let translated = "";
    if (mode === "gpt") {
      // GPT / Gemini 翻译
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + apiKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `把下面的日语翻译成中文：\n${text}` }] }]
        })
      });
      const data = await response.json();
      translated = data.candidates?.[0]?.content?.parts?.[0]?.text || "翻译失败";
    } else {
      translated = "目前仅支持 GPT/Gemini 模式";
    }

    res.json({ original: text, translated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Vercel 需要导出 app，而不是 app.listen
module.exports = app;
