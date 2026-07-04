// ローカル動作確認専用（Vercelにはデプロイされない）。
// `npm run dev` で起動し、api/配下と同じロジックをExpress経由で確認する。
const express = require("express");
const { fetchAllNews } = require("./src/fetchers");
const { renderPage } = require("./src/render/page");

const PORT = process.env.PORT || 3000;
const app = express();

app.get("/", async (req, res) => {
  let items = [];
  try {
    items = await fetchAllNews();
  } catch (err) {
    console.error("fetchAllNews failed:", err);
  }
  res.set("Cache-Control", "no-store");
  res.send(renderPage(items));
});

app.get("/health", async (req, res) => {
  try {
    const items = await fetchAllNews();
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Local dev server: http://localhost:${PORT}`);
});
