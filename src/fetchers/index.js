const { fetchHackerNews } = require("./hackernews");
const { fetchHatena } = require("./hatena");
const { fetchRssFeeds } = require("./rss");
const { maxItems } = require("../config/feeds");

// Hacker Newsは更新頻度が高く、単純な日時順マージだと他ソースを埋めてしまう。
// 各ソースを内部で新しい順に並べたうえで、ソース間を交互に取り出して
// バランスよく1つのリストへ混在させる。
function interleaveBySource(sourceArrays, limit) {
  const sorted = sourceArrays.map((arr) =>
    [...arr].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
  );
  const merged = [];
  let index = 0;
  while (merged.length < limit && sorted.some((arr) => index < arr.length)) {
    for (const arr of sorted) {
      if (index < arr.length) merged.push(arr[index]);
    }
    index += 1;
  }
  return merged.slice(0, limit);
}

// 3ソースを取得し、ソースごとの配列のまま返す（失敗したソースは黙って除外）。
// ウィジェット表示とダイジェスト生成の共通の取得層。
async function fetchAllSources() {
  const results = await Promise.allSettled([
    fetchHackerNews(),
    fetchHatena(),
    fetchRssFeeds(),
  ]);

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((arr) => arr.length > 0);
}

// Vercelはサーバーレス関数のためプロセスを常駐できない。
// リクエストのたびに各ソースへライブ取得しに行き、鮮度はVercel Edgeの
// HTTPキャッシュ（Cache-Controlのs-maxage）で担保する。
async function fetchAllNews() {
  const sourceArrays = await fetchAllSources();
  if (sourceArrays.length === 0) return [];
  return interleaveBySource(sourceArrays, maxItems);
}

module.exports = { fetchAllNews, fetchAllSources, interleaveBySource };
