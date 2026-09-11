const fs = require("fs");
const path = require("path");
const { renderTrendsPage } = require("../src/render/trends-page");

// Vercel Serverless Function: GET /trends
// data/trends.json（GitHub Actionsが日次でコミット）を読んでダッシュボードを描画。
// 実行時にLLMも外部取得もしない。データはリポジトリ同梱なので即応答。
const DATA_PATH = path.join(__dirname, "..", "data", "trends.json");

module.exports = (req, res) => {
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch (err) {
    console.error("trends.json load failed:", err);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.status(200).send(renderTrendsPage(data));
};
