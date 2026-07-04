const { fetchHackerNews } = require("./hackernews");
const { fetchHatena } = require("./hatena");
const { fetchRssFeeds } = require("./rss");
const { maxItems } = require("../config/feeds");

// Hacker Newsは更新頻度が高く、単純な日時順マージだと他ソースを埋めてしまう。
// 各ソースを内部で新しい順に並べたうえで、ソース間を交互に取り出して
// バランスよく1つのリストへ混在させる。
function interleaveBySource(sourceArrays) {
  const sorted = sourceArrays.map((arr) =>
    [...arr].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
  );
  const merged = [];
  let index = 0;
  while (merged.length < maxItems && sorted.some((arr) => index < arr.length)) {
    for (const arr of sorted) {
      if (index < arr.length) merged.push(arr[index]);
    }
    index += 1;
  }
  return merged.slice(0, maxItems);
}

// Vercelはサーバーレス関数のためプロセスを常駐できない。
// リクエストのたびに各ソースへライブ取得しに行き、鮮度はVercel Edgeの
// HTTPキャッシュ（Cache-Controlのs-maxage）で担保する。
async function fetchAllNews() {
  const results = await Promise.allSettled([
    fetchHackerNews(),
    fetchHatena(),
    fetchRssFeeds(),
  ]);

  const sourceArrays = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((arr) => arr.length > 0);

  if (sourceArrays.length === 0) return [];

  return interleaveBySource(sourceArrays);
}

module.exports = { fetchAllNews };
