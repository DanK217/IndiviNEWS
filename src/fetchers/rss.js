const Parser = require("rss-parser");
const { rssFeeds } = require("../config/feeds");

const parser = new Parser();

async function fetchOneFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  return (parsed.items || [])
    .filter((item) => item.title && item.link)
    .map((item) => ({
      source: feed.name,
      title: item.title,
      url: item.link,
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(0),
    }));
}

async function fetchRssFeeds() {
  const results = await Promise.allSettled(rssFeeds.map(fetchOneFeed));
  return results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

module.exports = { fetchRssFeeds, parser };
