const { hackerNews } = require("../config/feeds");

const TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const ITEM_URL = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

async function fetchHackerNews() {
  const topIdsRes = await fetch(TOP_STORIES_URL);
  if (!topIdsRes.ok) {
    throw new Error(`HN topstories fetch failed: ${topIdsRes.status}`);
  }
  const topIds = (await topIdsRes.json()).slice(0, hackerNews.topStoriesCount);

  const items = await Promise.all(
    topIds.map(async (id) => {
      const res = await fetch(ITEM_URL(id));
      if (!res.ok) return null;
      return res.json();
    }),
  );

  return items
    .filter((item) => item && item.title && item.url)
    .map((item) => ({
      source: "Hacker News",
      title: item.title,
      url: item.url,
      publishedAt: item.time ? new Date(item.time * 1000) : new Date(0),
    }));
}

module.exports = { fetchHackerNews };
