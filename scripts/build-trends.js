/*
 * build-trends.js — 蓄積ダイジェストを集計して data/trends.json を生成する。
 *
 * 実行時LLM不使用・新規依存なし（Node標準のみ）。GitHub Actionsが
 * ダイジェスト生成の直後に実行し、data/trends.json をコミットする。
 * ダッシュボード（/trends）はこのJSONを読んで描画するだけ。
 *
 * 実行: node scripts/build-trends.js
 */
const fs = require("fs");
const path = require("path");
const { loadAllItems } = require("./lib/parse-digests");
const { tallyKeywords, extractFromTitle } = require("./lib/keywords");

const OUT_PATH = path.join(__dirname, "..", "data", "trends.json");

const SOURCES = ["Hacker News", "はてなブックマーク", "Zenn", "Publickey"];
const TOP_KEYWORDS = 24; // ランキングに載せる上位数
const TREND_KEYWORDS = 8; // 週次推移を出す上位数
const TOP_LONGEVITY = 12; // 「長く居座った話題」の上位数

// --- 週バケット（ISO週。月曜始まりのローカル日付ラベルも付ける） --------------
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // 月=0..日=6
  d.setUTCDate(d.getUTCDate() - day + 3); // その週の木曜へ
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round((d - firstThu) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// その週の月曜のM/D表記（チャートの軸ラベル用）
function weekStartLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// --- URL正規化（同一記事の別日再掲を「話題の寿命」として数えるため） ----------
function canonicalUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const p = u.pathname.replace(/\/+$/, "");
    return `${host}${p}`;
  } catch {
    return String(url).trim().toLowerCase();
  }
}

function build() {
  const items = loadAllItems();
  if (items.length === 0) {
    throw new Error("ダイジェストが見つかりません（digests/ が空）。");
  }

  const dates = [...new Set(items.map((i) => i.date))].sort();

  // 1) ソース別の週次投稿数（積み上げ棒グラフ用）
  const weekOrder = [];
  const weekSeen = new Set();
  const sourceWeekly = new Map(); // weekKey -> {label, counts:{source:n}}
  for (const it of items) {
    const wk = isoWeekKey(it.date);
    if (!weekSeen.has(wk)) {
      weekSeen.add(wk);
      weekOrder.push(wk);
      sourceWeekly.set(wk, { label: weekStartLabel(it.date), counts: {} });
    }
    const bucket = sourceWeekly.get(wk).counts;
    bucket[it.source] = (bucket[it.source] || 0) + 1;
  }
  weekOrder.sort();
  const sourceWeeklySeries = weekOrder.map((wk) => ({
    week: wk,
    label: sourceWeekly.get(wk).label,
    counts: SOURCES.map((s) => sourceWeekly.get(wk).counts[s] || 0),
  }));

  // 2) キーワード総合ランキング（1見出し1カウント）
  const { counts, displayMap } = tallyKeywords(items);
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, term: displayMap.get(key), count }));
  const keywordTotal = ranked.slice(0, TOP_KEYWORDS);

  // 3) 上位キーワードの週次推移（スパークライン用）
  const trendKeys = ranked.slice(0, TREND_KEYWORDS).map((r) => r.key);
  const trendIndex = new Map(trendKeys.map((k, i) => [k, i]));
  // weekKey -> [count per trendKey]
  const trendByWeek = new Map(
    weekOrder.map((wk) => [wk, new Array(trendKeys.length).fill(0)]),
  );
  const perTitleDisplay = new Map();
  for (const it of items) {
    const keys = extractFromTitle(it.title, perTitleDisplay);
    const wk = isoWeekKey(it.date);
    const row = trendByWeek.get(wk);
    for (const k of keys) {
      const idx = trendIndex.get(k);
      if (idx !== undefined) row[idx] += 1;
    }
  }
  const keywordTrend = trendKeys.map((k, i) => ({
    term: displayMap.get(k),
    total: counts.get(k),
    weekly: weekOrder.map((wk) => trendByWeek.get(wk)[i]),
  }));

  // 4) 話題の寿命（同一URLが何日ぶん登場したか）
  const byUrl = new Map(); // canonical -> {title,url,dates:Set,sources:Set}
  for (const it of items) {
    const key = canonicalUrl(it.url);
    if (!byUrl.has(key)) {
      byUrl.set(key, {
        title: it.title,
        url: it.url,
        dates: new Set(),
        sources: new Set(),
      });
    }
    const rec = byUrl.get(key);
    rec.dates.add(it.date);
    rec.sources.add(it.source);
    // より短い（正規化に近い）URLや新しいタイトルに寄せる必要はない。初出で十分。
  }
  const longevity = [...byUrl.values()]
    .map((r) => ({
      title: r.title,
      url: r.url,
      days: r.dates.size,
      sources: [...r.sources],
    }))
    .filter((r) => r.days >= 2)
    .sort((a, b) => b.days - a.days || a.title.localeCompare(b.title))
    .slice(0, TOP_LONGEVITY);

  const perSourceTotal = SOURCES.map((s) => ({
    source: s,
    count: items.filter((i) => i.source === s).length,
  }));

  return {
    generatedAt: new Date().toISOString(),
    range: { from: dates[0], to: dates[dates.length - 1], days: dates.length },
    totals: { headlines: items.length, keywords: counts.size, perSource: perSourceTotal },
    sources: SOURCES,
    sourceWeekly: sourceWeeklySeries,
    keywordTotal,
    keywordTrend,
    keywordTrendWeeks: weekOrder.map((wk, i) => sourceWeeklySeries[i].label),
    longevity,
  };
}

function main() {
  const data = build();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
  console.log(
    `saved: ${OUT_PATH}  (${data.totals.headlines} headlines, ` +
      `${data.range.days} days, ${data.keywordTotal.length} top keywords)`,
  );
}

if (require.main === module) main();
module.exports = { build };
