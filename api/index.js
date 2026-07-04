const { fetchAllNews } = require("../src/fetchers");
const { renderPage } = require("../src/render/page");

// Vercel Serverless Function（Node.js）: GET / (vercel.jsonのrewriteでここに来る)
// Widgetsmithからのアクセス毎にライブ取得はせず、Vercel Edgeのキャッシュ
// （s-maxage=1800 = 30分）を効かせて、実行回数と外部フィードへの負荷を抑える。
module.exports = async (req, res) => {
  let items = [];
  try {
    items = await fetchAllNews();
  } catch (err) {
    console.error("fetchAllNews failed:", err);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=300",
  );
  res.status(200).send(renderPage(items));
};
