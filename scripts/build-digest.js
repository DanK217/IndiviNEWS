/*
 * build-digest.js — 毎朝のニュースダイジェストを生成する（LLM不使用・完全無料）。
 *
 * ランニングコスト0を成立させるため、要約・選定にLLM APIは使わない。
 * 代わりにルールベースで構成する:
 *   - 今日のピック: ウィジェットと同じソース間交互選出で上位3件
 *   - ソース別セクション: 各ソースの最新5件（URL重複はソース間で排除）
 *
 * GitHub Actionsから毎朝実行され、digests/YYYY-MM-DD.md としてコミットされる。
 * 実行: node scripts/build-digest.js
 */
const fs = require("fs");
const path = require("path");
const { fetchAllSources, interleaveBySource } = require("../src/fetchers");
const { clusterItems } = require("../src/cluster");

const DIGEST_DIR = path.join(__dirname, "..", "digests");
const PICKS_COUNT = 3;
const PER_SOURCE_COUNT = 5;

function jstDateString(date = new Date()) {
  // sv-SE ロケールは YYYY-MM-DD 形式を返すため日付キーとして利用する
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
  }).format(date);
}

function jstTimeString(publishedAt) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(publishedAt));
}

// 複数ソースにまたがる同一話題の記事をクラスタリングする
function clusterAndDedupe(sourceArrays) {
  // すべてのアイテムをフラットにしてクラスタリング
  const allItems = sourceArrays.flat();
  const clusters = clusterItems(allItems);

  // クラスタを処理：複数ソース横断なら代表アイテムのみ、注記を追加
  const processedItems = [];
  const sourceMap = new Map();

  for (const cluster of clusters) {
    // クラスタ内の一意なソースを集計
    const uniqueSources = [...new Set(cluster.map((item) => item.source))];

    if (uniqueSources.length > 1) {
      // 複数ソースにまたがる場合：代表アイテム（最新）のみを使用し、注記を追加
      const representative = cluster[0]; // クラスタ内で最新
      const sourceNotes = uniqueSources.join("・");
      const itemWithNote = {
        ...representative,
        _sourceNote: sourceNotes,
      };
      processedItems.push(itemWithNote);
    } else {
      // 単一ソース内の重複：すべてを保持
      processedItems.push(...cluster);
    }
  }

  // ソースごとに再グループ化してsourceArrays構造に戻す
  const result = sourceArrays.map(() => []);
  const sourceNameToIndex = new Map();
  sourceArrays.forEach((arr, idx) => {
    if (arr.length > 0) {
      sourceNameToIndex.set(arr[0].source, idx);
    }
  });

  for (const item of processedItems) {
    const idx = sourceNameToIndex.get(item.source);
    if (idx !== undefined) {
      result[idx].push(item);
    }
  }

  return result;
}

function formatItem(item) {
  let formatted = `- [${item.title}](${item.url}) — ${jstTimeString(item.publishedAt)}`;
  if (item._sourceNote) {
    formatted += `（${item._sourceNote}で話題）`;
  }
  return formatted;
}

function buildMarkdown(sourceArrays) {
  const today = jstDateString();
  const lines = [`# ${today} テックニュースダイジェスト`, ""];

  const picks = interleaveBySource(sourceArrays, PICKS_COUNT);
  lines.push("## 今日のピック", "");
  for (const item of picks) {
    lines.push(`- **[${item.title}](${item.url})**（${item.source}）`);
  }
  lines.push("");

  // fetchAllSources()の1配列には複数ソースが混在しうる（RSSはZenn+Publickey等）
  // ため、見出し単位のsourceフィールドでグルーピングし直す。
  const bySource = new Map();
  for (const item of sourceArrays.flat()) {
    if (!bySource.has(item.source)) bySource.set(item.source, []);
    bySource.get(item.source).push(item);
  }

  for (const [source, items] of bySource) {
    const sorted = [...items].sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
    );
    lines.push(`## ${source}`, "");
    for (const item of sorted.slice(0, PER_SOURCE_COUNT)) {
      lines.push(formatItem(item));
    }
    lines.push("");
  }

  lines.push("---", "", "_このダイジェストはLLMを使わずルールベースで自動生成されています（運用コスト: 0円）。_", "");
  return lines.join("\n");
}

async function main() {
  const sourceArrays = clusterAndDedupe(await fetchAllSources());
  if (sourceArrays.every((arr) => arr.length === 0)) {
    console.error("全ソースの取得に失敗しました。ダイジェストは生成しません。");
    process.exitCode = 1;
    return;
  }

  const markdown = buildMarkdown(sourceArrays);
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  const outPath = path.join(DIGEST_DIR, `${jstDateString()}.md`);
  fs.writeFileSync(outPath, markdown);
  console.log(`saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
