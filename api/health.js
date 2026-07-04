const { fetchAllNews } = require("../src/fetchers");

// デバッグ用: 各ソースの取得件数・内容をJSONで確認する（/api/health）
module.exports = async (req, res) => {
  try {
    const items = await fetchAllNews();
    res.status(200).json({ ok: true, count: items.length, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
};
