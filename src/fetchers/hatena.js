const { parser } = require("./rss");
const { hatena } = require("../config/feeds");

async function fetchHatena() {
  const parsed = await parser.parseURL(hatena.feedUrl);
  return (parsed.items || [])
    .filter((item) => item.title && item.link)
    .map((item) => ({
      source: "はてなブックマーク",
      title: item.title,
      url: item.link,
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(0),
    }));
}

module.exports = { fetchHatena };
