/*
 * build-digest.js — 毎朝のニュースダイジェストを生成する（LLM不使用・完全無料）。
 *
 * ランニングコスト0を成立させるため、要約・選定にLLM APIは使わない。
 * 代わりにルールベースで構成する:
 *   - 今日のピック: ウィジェットと同じソース間交互選出で上位3件
 *   - ソース別セクション: 各ソースの最新5件
 *   （同一記事・同一話題はsrc/cluster.jsでクラスタ化し代表記事のみ掲載）
 *
 * GitHub Actionsから毎朝実行され、digests/YYYY-MM-DD.md としてコミットされる。
 * 実行: node scripts/build-digest.js
 */
const fs = require("fs");
const path = require("path");
const { fetchAllSources } = require("../src/fetchers");
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

// 複数ソースにまたがる同一記事・同一話題のクラスタは代表記事1件のみを残し、
// まとまったソース名を注記として付与する（クラスタリングによる重複統合）。
function collapseClusters(items) {
  return clusterItems(items).map((cluster) => {
    const representative = cluster[0];
    if (cluster.length === 1) {
      return { item: representative, note: null };
    }
    const sources = [];
    for (const item of cluster) {
      if (!sources.includes(item.source)) sources.push(item.source);
    }
    return { item: representative, note: `（${sources.join("・")}で話題）` };
  });
}

// クラスタ統合後のエントリを対象に、ソース間で偏らないよう交互に取り出す。
function interleaveCollapsed(collapsed, limit) {
  const bySource = new Map();
  for (const entry of collapsed) {
    const source = entry.item.source;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(entry);
  }
  const grouped = [...bySource.values()].map((arr) =>
    [...arr].sort(
      (a, b) => new Date(b.item.publishedAt) - new Date(a.item.publishedAt),
    ),
  );

  const merged = [];
  let index = 0;
  while (merged.length < limit && grouped.some((arr) => index < arr.length)) {
    for (const arr of grouped) {
      if (index < arr.length) merged.push(arr[index]);
    }
    index += 1;
  }
  return merged.slice(0, limit);
}

function formatItem({ item, note }) {
  const suffix = note ? ` ${note}` : "";
  return `- [${item.title}](${item.url}) — ${jstTimeString(item.publishedAt)}${suffix}`;
}

function buildMarkdown(collapsed) {
  const today = jstDateString();
  const lines = [`# ${today} テックニュースダイジェスト`, ""];

  const picks = interleaveCollapsed(collapsed, PICKS_COUNT);
  lines.push("## 今日のピック", "");
  for (const { item, note } of picks) {
    const suffix = note ? ` ${note}` : "";
    lines.push(`- **[${item.title}](${item.url})**（${item.source}）${suffix}`);
  }
  lines.push("");

  // クラスタ統合後のエントリを、代表記事のsourceでグルーピングし直す。
  const bySource = new Map();
  for (const entry of collapsed) {
    const source = entry.item.source;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(entry);
  }

  for (const [source, entries] of bySource) {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.item.publishedAt) - new Date(a.item.publishedAt),
    );
    lines.push(`## ${source}`, "");
    for (const entry of sorted.slice(0, PER_SOURCE_COUNT)) {
      lines.push(formatItem(entry));
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

  const collapsed = collapseClusters(sourceArrays.flat());
  const markdown = buildMarkdown(collapsed);
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  const outPath = path.join(DIGEST_DIR, `${jstDateString()}.md`);
  fs.writeFileSync(outPath, markdown);
  console.log(`saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
