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
const { collapseToRepresentatives } = require("../src/cluster");

const DIGEST_DIR = path.join(__dirname, "..", "digests");
const PICKS_COUNT = 3;
const PER_SOURCE_COUNT = 5;

// 複数ソースにまたがった話題の注記に使う略称（未定義のソースはそのまま表示）
const SOURCE_SHORT_NAMES = {
  "Hacker News": "HN",
  はてなブックマーク: "はてな",
};

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

// src/cluster.js の collapseToRepresentatives が返す multiSourceReps
// （代表記事→元のソース名一覧）を、ダイジェスト表示用の注記文字列
// （例:「HN・はてな」）に変換する。クラスタリング自体はウィジェット側
// （src/fetchers/index.js）と共通のロジックを使う。
function buildNotes(multiSourceReps) {
  const notes = new Map();
  for (const [representative, sources] of multiSourceReps) {
    notes.set(
      representative,
      sources.map((s) => SOURCE_SHORT_NAMES[s] || s).join("・"),
    );
  }
  return notes;
}

function topicNote(item, notes) {
  const sources = notes.get(item);
  return sources ? `（${sources}で話題）` : "";
}

function formatItem(item, notes) {
  return `- [${item.title}](${item.url}) — ${jstTimeString(item.publishedAt)}${topicNote(item, notes)}`;
}

function buildMarkdown(sourceArrays, notes) {
  const today = jstDateString();
  const lines = [`# ${today} テックニュースダイジェスト`, ""];

  const picks = interleaveBySource(sourceArrays, PICKS_COUNT);
  lines.push("## 今日のピック", "");
  for (const item of picks) {
    lines.push(
      `- **[${item.title}](${item.url})**（${item.source}）${topicNote(item, notes)}`,
    );
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
      lines.push(formatItem(item, notes));
    }
    lines.push("");
  }

  lines.push("---", "", "_このダイジェストはLLMを使わずルールベースで自動生成されています（運用コスト: 0円）。_", "");
  return lines.join("\n");
}

async function main() {
  const fetched = await fetchAllSources();
  if (fetched.every((arr) => arr.length === 0)) {
    console.error("全ソースの取得に失敗しました。ダイジェストは生成しません。");
    process.exitCode = 1;
    return;
  }

  const { sourceArrays, multiSourceReps } = collapseToRepresentatives(fetched);
  const notes = buildNotes(multiSourceReps);
  const markdown = buildMarkdown(sourceArrays, notes);
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  const outPath = path.join(DIGEST_DIR, `${jstDateString()}.md`);
  fs.writeFileSync(outPath, markdown);
  console.log(`saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
