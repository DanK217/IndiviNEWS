/**
 * cluster.js — 複数ニュースソース間で同じ話題の記事をまとめる
 * LLMなし、外部ネットワーク呼び出しなしの決定的なクラスタリング
 */

/**
 * URLを正規化（プロトコル、クエリパラメータ、末尾スラッシュを統一）
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // プロトコルはhttpsに統一
    u.protocol = "https:";
    // クエリパラメータを削除
    u.search = "";
    // 末尾スラッシュを削除
    let pathname = u.pathname;
    if (pathname.endsWith("/") && pathname !== "/") {
      pathname = pathname.slice(0, -1);
    }
    u.pathname = pathname;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * タイトルを正規化（装飾、サイト名サフィックス、大文字小文字、空白）
 */
function normalizeTitle(title) {
  // サイト名サフィックスを削除（" - Qiita", " - Zenn" など）
  let normalized = title.replace(/\s+[-−–—]\s+[A-Za-z0-9ぁ-ん]+$/, "");

  // 装飾を削除（【速報】など）
  normalized = normalized.replace(/[\s　]*【[^】]*】[\s　]*/g, "");
  normalized = normalized.replace(/[\s　]*「[^」]*」[\s　]*/g, "");
  normalized = normalized.replace(/[\s　]*『[^』]*』[\s　]*/g, "");

  // 全角スペースを半角スペースに
  normalized = normalized.replace(/　+/g, " ");
  // 複数スペースを単一スペースに
  normalized = normalized.replace(/ +/g, " ");
  // 首尾の空白を削除
  normalized = normalized.trim();
  // 小文字に統一
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * 2つのタイトルが同一話題かどうかを判定（アルゴリズム: 正規化+単語の重複度）
 */
function isSameTopic(title1, title2) {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // 完全一致
  if (norm1 === norm2) return true;

  // 短すぎる場合は類似度を上げる
  const minLen = Math.min(norm1.length, norm2.length);
  if (minLen < 5) return false;

  // 長さが極端に異なる場合は同一話題ではないと判定
  const lenRatio = Math.max(norm1.length, norm2.length) /
    Math.min(norm1.length, norm2.length);
  if (lenRatio > 2.5) return false;

  // 単語分割（スペースで区切る）
  const words1 = norm1.split(/\s+/).filter((w) => w.length > 1);
  const words2 = norm2.split(/\s+/).filter((w) => w.length > 1);

  if (words1.length === 0 || words2.length === 0) return norm1 === norm2;

  // Jaccard類似度を計算
  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  const jaccardSim = intersection / union;

  // 包含関係をチェック（「GPT-6」「GPT-6安全性」など）
  // 短い方の単語がすべて長い方に含まれているか
  const shortWords = words1.length <= words2.length ? set1 : set2;
  const longWords = words1.length > words2.length ? set1 : set2;

  let containsAll = true;
  for (const word of shortWords) {
    if (!longWords.has(word)) {
      containsAll = false;
      break;
    }
  }

  // 包含関係があり、Jaccard類似度が0.5以上なら同一話題
  if (containsAll && jaccardSim >= 0.5) return true;

  // 通常はJaccard類似度が0.6以上で同一話題
  return jaccardSim >= 0.6;
}

/**
 * @param {Array<{source: string, title: string, url: string, publishedAt: Date|string}>} items
 * @returns {Array<Array<item>>} クラスタの配列。各クラスタは渡されたitemオブジェクトの配列。
 */
function clusterItems(items) {
  if (items.length === 0) return [];

  const clusters = [];
  const assigned = new Set();

  // Pass 1: 正規化されたURLで同一記事をまとめる
  const urlMap = new Map();
  for (let i = 0; i < items.length; i++) {
    const normalizedUrl = normalizeUrl(items[i].url);
    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, []);
    }
    urlMap.get(normalizedUrl).push(i);
  }

  // Pass 1の結果に基づいてクラスタを作成
  for (const indices of urlMap.values()) {
    const cluster = indices.map((i) => items[i]);
    clusters.push(cluster);
    indices.forEach((i) => assigned.add(i));
  }

  // Pass 2: タイトル類似度で同一話題をまとめる（URLが異なるが同じ話題）
  const itemsToProcess = [];
  for (let i = 0; i < items.length; i++) {
    // 既にクラスタに割り当てられたアイテムをスキップ
    // （実装: すべてのアイテムが Pass 1 で割り当てられるので、
    //  ここでは再度チェック不要だが、後の安全性のため記述）
  }

  // Pass 2: 既存クラスタ同士をマージするかチェック
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length && !merged; i++) {
      for (let j = i + 1; j < clusters.length && !merged; j++) {
        // 2つのクラスタが同一話題かチェック
        const representative1 = clusters[i][0];
        const representative2 = clusters[j][0];

        if (isSameTopic(representative1.title, representative2.title)) {
          // マージ
          clusters[i].push(...clusters[j]);
          clusters.splice(j, 1);
          merged = true;
        }
      }
    }
  }

  // ソート: 各クラスタ内を新しい順、クラスタ同士を代表記事の新しい順
  for (const cluster of clusters) {
    cluster.sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
    );
  }

  clusters.sort(
    (a, b) => new Date(b[0].publishedAt) - new Date(a[0].publishedAt),
  );

  return clusters;
}

module.exports = { clusterItems };
