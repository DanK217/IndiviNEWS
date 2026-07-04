/*
 * cluster.js — 複数ニュースソース間で「同じ記事」「同じ話題」の見出しをまとめる。
 *
 * LLMは使わず、URL正規化とタイトルの文字n-gram類似度のみで判定する（コスト0円維持）。
 */

const TITLE_SIMILARITY_THRESHOLD = 0.5;

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let pathname = u.pathname.replace(/\/+$/, "");
    if (pathname === "") pathname = "/";
    return `${host}${pathname}`;
  } catch {
    return String(rawUrl).trim().toLowerCase();
  }
}

// 先頭の【速報】【独自】のような装飾と、末尾の " - Qiita" のようなサイト名
// サフィックスを取り除き、全角/半角・大文字/小文字を統一する。
function normalizeTitle(rawTitle) {
  if (!rawTitle) return "";
  let t = String(rawTitle).normalize("NFKC").toLowerCase();
  t = t.replace(/　/g, " ");

  const leadingDecoration = /^\s*[【\[(（《〔][^】\])）》〕]{0,20}[】\])）》〕]\s*/;
  while (leadingDecoration.test(t)) {
    t = t.replace(leadingDecoration, "");
  }

  // サイト名サフィックスは区切り文字の前後に空白があるものだけを対象にし、
  // ハイフン区切りの複合語（例: "iphone17-発売"）を誤って削らないようにする。
  const trailingSiteSuffix = /\s[-|–—―｜]\s*[^\s\-|–—―｜]{1,20}$/;
  if (trailingSiteSuffix.test(t)) {
    t = t.replace(trailingSiteSuffix, "");
  }

  return t.replace(/\s+/g, " ").trim();
}

function isMeaningfulChar(ch) {
  return /[\p{L}\p{N}]/u.test(ch);
}

// ASCII英数字の連続はそのまま1トークンに、それ以外(日本語などマルチバイト文字を
// 含む連続)は文字bigramに分解する。スペースや記号は区切りとして無視する。
function extractTokens(normalizedTitle) {
  const tokens = new Set();
  const s = normalizedTitle;
  let i = 0;
  while (i < s.length) {
    if (!isMeaningfulChar(s[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < s.length && isMeaningfulChar(s[j])) j += 1;
    const run = s.slice(i, j);

    if (/^[a-z0-9]+$/.test(run)) {
      tokens.add(run);
    } else if (run.length === 1) {
      tokens.add(run);
    } else {
      for (let k = 0; k < run.length - 1; k += 1) {
        tokens.add(run.slice(k, k + 2));
      }
    }
    i = j;
  }
  return tokens;
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let intersection = 0;
  for (const token of small) {
    if (large.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA] += 1;
    }
  }
}

/**
 * @param {Array<{source: string, title: string, url: string, publishedAt: Date|string}>} items
 * @returns {Array<Array<item>>}  クラスタの配列。各クラスタは渡されたitemオブジェクトの配列。
 */
function clusterItems(items) {
  const n = items.length;
  if (n === 0) return [];

  const normalizedUrls = items.map((item) => normalizeUrl(item.url));
  const normalizedTitles = items.map((item) => normalizeTitle(item.title));
  const tokenSets = normalizedTitles.map((title) => extractTokens(title));

  const uf = new UnionFind(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (normalizedUrls[i] && normalizedUrls[i] === normalizedUrls[j]) {
        uf.union(i, j);
        continue;
      }
      if (normalizedTitles[i] && normalizedTitles[i] === normalizedTitles[j]) {
        uf.union(i, j);
        continue;
      }
      if (jaccard(tokenSets[i], tokenSets[j]) >= TITLE_SIMILARITY_THRESHOLD) {
        uf.union(i, j);
      }
    }
  }

  const timeOf = (idx) => {
    const t = new Date(items[idx].publishedAt).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  const clusterIndices = Array.from(groups.values()).map((indices) =>
    [...indices].sort((a, b) => {
      const diff = timeOf(b) - timeOf(a);
      return diff !== 0 ? diff : a - b;
    }),
  );

  clusterIndices.sort((a, b) => {
    const diff = timeOf(b[0]) - timeOf(a[0]);
    return diff !== 0 ? diff : a[0] - b[0];
  });

  return clusterIndices.map((indices) => indices.map((idx) => items[idx]));
}

module.exports = { clusterItems };
