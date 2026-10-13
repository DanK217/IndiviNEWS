/*
 * source-health.js — 日々のニュース取得について、ソース単位の健全性を追跡する。
 *
 * build-digest.js は「全ソースが同時に0件」の時しか失敗扱いにしないため、
 * 1ソースだけが何日も0件を返し続けても誰にも気づかれない問題があった。
 * ここでは各ソースについて「連続で0件だった日数」を data/health.json に
 * 永続化し、閾値を超えたら呼び出し側で明示的に失敗扱いにできるようにする
 * （単発の一時的な0件はノイズとして無視し、連続2日以上を異常とみなす）。
 */
const { rssFeeds } = require("../../src/config/feeds");

// この日数以上連続で0件が続いたら「劣化」とみなす。
// 1日だけの一時的なネットワーク不調等で騒がしくなり過ぎないための閾値。
const DEGRADED_THRESHOLD_DAYS = 2;

// 期待されるソース名一覧。fetchers側が実際に items[].source にセットする値と
// 一致させる（hackernews.js固定の"Hacker News"、hatena.js固定の
// "はてなブックマーク"、rss.jsはfeeds.jsのrssFeeds[].nameをそのまま使う）。
function expectedSources() {
  return ["Hacker News", "はてなブックマーク", ...rssFeeds.map((f) => f.name)];
}

// フラットな記事配列 → {ソース名: 件数}
function countBySource(items) {
  const counts = {};
  for (const item of items) {
    counts[item.source] = (counts[item.source] || 0) + 1;
  }
  return counts;
}

// 前日までのhealth状態 + 本日の件数 → 新しいhealth状態。
// health の形: { [source]: { lastSuccessDate: "YYYY-MM-DD"|null, consecutiveEmptyDays: number } }
function updateHealth(prevHealth, counts, today) {
  const nextHealth = {};
  for (const source of expectedSources()) {
    const prev = (prevHealth && prevHealth[source]) || {
      lastSuccessDate: null,
      consecutiveEmptyDays: 0,
    };
    const gotItems = (counts[source] || 0) > 0;
    nextHealth[source] = gotItems
      ? { lastSuccessDate: today, consecutiveEmptyDays: 0 }
      : {
          lastSuccessDate: prev.lastSuccessDate,
          consecutiveEmptyDays: prev.consecutiveEmptyDays + 1,
        };
  }
  return nextHealth;
}

// 閾値を超えて連続0件になっているソースの一覧を返す。
function degradedSources(health, threshold = DEGRADED_THRESHOLD_DAYS) {
  return Object.entries(health)
    .filter(([, v]) => v.consecutiveEmptyDays >= threshold)
    .map(([source, v]) => ({ source, ...v }));
}

module.exports = {
  DEGRADED_THRESHOLD_DAYS,
  expectedSources,
  countBySource,
  updateHealth,
  degradedSources,
};
