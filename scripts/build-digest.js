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

// ソース名の短縮表記（複数ソースにまたがるクラスタの注記に使う）。
const SOURCE_SHORT = {
  "Hacker News": "HN",
  はてなブックマーク: "はてな",
};

function shortSource(source) {
  return SOURCE_SHORT[source] || source;
}

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

// クラスタリングで同一記事・同一話題をまとめ、各クラスタの代表記事1件に集約する。
// 複数ソースにまたがるクラスタには、話題になったソース一覧の注記を付ける。
// これにより従来のURL完全一致による重複排除を置き換える（URL揺れ・別ソースの
// 同一話題まで吸収できる）。
function summarizeClusters(sourceArrays) {
  const clusters = clusterItems(sourceArrays.flat());
  const reps = [];
  const noteByItem = new Map();

  for (const cluster of clusters) {
    const rep = cluster[0]; // clusterItemsはクラスタ内を新しい順に整列済み
    reps.push(rep);

    // クラスタ内で登場するソースを新しい順・重複なしで集める。
    const sources = [];
    for (const item of cluster) {
      if (!sources.includes(item.source)) sources.push(item.source);
    }
    if (sources.length >= 2) {
      const label = sources.map(shortSource).join("・");
      noteByItem.set(rep, `（${label}で話題）`);
    }
  }

  return { reps, noteByItem };
}

function formatItem(item, note) {
  const suffix = note ? ` ${note}` : "";
  return `- [${item.title}](${item.url}) — ${jstTimeString(item.publishedAt)}${suffix}`;
}

function buildMarkdown(sourceArrays) {
  const today = jstDateString();
  const lines = [`# ${today} テックニュースダイジェスト`, ""];

  const { reps, noteByItem } = summarizeClusters(sourceArrays);

  // 代表記事をソース別配列に組み直し、ウィジェットと同じ交互選出でピックを作る。
  const repsBySource = new Map();
  for (const item of reps) {
    if (!repsBySource.has(item.source)) repsBySource.set(item.source, []);
    repsBySource.get(item.source).push(item);
  }

  const picks = interleaveBySource([...repsBySource.values()], PICKS_COUNT);
  lines.push("## 今日のピック", "");
  for (const item of picks) {
    const note = noteByItem.get(item);
    lines.push(
      `- **[${item.title}](${item.url})**（${item.source}）${note ? ` ${note}` : ""}`,
    );
  }
  lines.push("");

  // 代表記事を見出し単位のsourceフィールドでグルーピングしてソース別に掲載する。
  for (const [source, items] of repsBySource) {
    const sorted = [...items].sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
    );
    lines.push(`## ${source}`, "");
    for (const item of sorted.slice(0, PER_SOURCE_COUNT)) {
      lines.push(formatItem(item, noteByItem.get(item)));
    }
    lines.push("");
  }

  lines.push("---", "", "_このダイジェストはLLMを使わずルールベースで自動生成されています（運用コスト: 0円）。_", "");
  return lines.join("\n");
}

async function main() {
  const sourceArrays = await fetchAllSources();
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
