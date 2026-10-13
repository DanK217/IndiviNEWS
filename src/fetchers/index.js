const { fetchHackerNews } = require("./hackernews");
const { fetchHatena } = require("./hatena");
const { fetchRssFeeds } = require("./rss");
const { maxItems } = require("../config/feeds");
const { collapseToRepresentatives } = require("../cluster");

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
// limitで取得件数を指定できる（既定はウィジェット向けのmaxItems）。
// 複数ソースにまたがる同一記事・同一話題は src/cluster.js（ダイジェスト生成と
// 共通のロジック）で1件に畳み込んでから件数を切り出す。画面側の見た目・HTML構造は
// 変更しない——重複が減った分だけ別の記事が繰り上がるだけ。
async function fetchAllNews(limit = maxItems) {
  const sourceArrays = await fetchAllSources();
  if (sourceArrays.length === 0) return [];
  const { sourceArrays: deduped } = collapseToRepresentatives(sourceArrays);
  return interleaveBySource(deduped, limit);
}

module.exports = { fetchAllNews, fetchAllSources, interleaveBySource };
