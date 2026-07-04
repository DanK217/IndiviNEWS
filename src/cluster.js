/*
 * cluster.js — 類似記事クラスタリング（LLM不使用・外部通信なし・依存追加なし）。
 *
 * 複数ソース間で「同じ記事」「同じ話題」をまとめる:
 *   - URLの正規化キー一致（http/https・www・末尾スラッシュ・クエリ等の表記ゆれを吸収）
 *   - タイトルの正規化キー一致（全角/半角・大文字小文字・【速報】等の装飾・
 *     「 - Qiita」等のサイト名サフィックスを吸収）
 *   - 正規化タイトルの文字バイグラムDice係数によるあいまい一致（軽微な言い回し差のみ）
 *
 * 閾値は「別話題を誤ってまとめない」ことを優先して保守的に設定している
 * （例:「GPT-6を発表」と「GPT-6の安全性に懸念」はマッチしない）。
 * 言語をまたいだ同一話題の検出はスコープ外。
 */

// あいまい一致の判定に使うDice係数の下限。これ未満は別話題とみなす。
const SIMILARITY_THRESHOLD = 0.85;
// 正規化キーがこれより短いタイトルは情報量が乏しく誤結合しやすいため、
// 完全一致・あいまい一致それぞれで最低長を課す。
const MIN_EXACT_KEY_LENGTH = 4;
const MIN_FUZZY_KEY_LENGTH = 8;

// URLの表記ゆれを吸収した比較キー。プロトコル・www.・クエリ・フラグメント・
// 末尾スラッシュを無視する。URLとして解釈できなければ文字列のまま比較する。
function canonicalUrl(url) {
  try {
    const u = new URL(String(url));
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return String(url).trim().toLowerCase();
  }
}

// 「タイトル本文 - サイト名」「タイトル本文 | サイト名」形式の末尾サイト名を落とす。
// 本文側が十分残り、末尾側が短い（サイト名らしい）場合のみ適用する。
// NFKC正規化後に呼ぶ前提のため、区切りはASCII系の記号だけ見ればよい。
const SUFFIX_SEPARATORS = [" - ", " | ", " – ", " — "];
function stripSiteSuffix(title) {
  let sepIndex = -1;
  let sepLength = 0;
  for (const sep of SUFFIX_SEPARATORS) {
    const idx = title.lastIndexOf(sep);
    if (idx > sepIndex) {
      sepIndex = idx;
      sepLength = sep.length;
    }
  }
  if (sepIndex === -1) return title;

  const head = title.slice(0, sepIndex).trim();
  const tail = title.slice(sepIndex + sepLength).trim();
  const tailLooksLikeSiteName =
    tail.length > 0 && tail.length <= 25 && tail.split(/\s+/).length <= 3;
  if (head.length >= 8 && tailLooksLikeSiteName) return head;
  return title;
}

// タイトルの表記ゆれを吸収した比較キー。
// NFKCで全角/半角を統一し、小文字化・【装飾】除去・サイト名サフィックス除去の後、
// 記号や空白をすべて落として文字と数字だけにする。
function titleKey(title) {
  let t = String(title).normalize("NFKC").toLowerCase();
  t = t.replace(/【[^】]*】/g, " ").trim();
  t = stripSiteSuffix(t);
  return t.replace(/[^\p{L}\p{N}]+/gu, "");
}

// キーに含まれる数字列を出現順に連結したもの。「vol.1」と「vol.2」、
// 「GPT-5」と「GPT-6」のような番号・バージョン違いはタイトルの大半が
// 一致していても別話題なので、あいまい一致の前提条件として数字列の
// 一致を要求する。
function digitSignature(key) {
  return (key.match(/\p{N}+/gu) || []).join(",");
}

function bigrams(s) {
  const grams = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  return grams;
}

// 文字バイグラムのDice係数（0〜1）。日本語・英語どちらでも機能する。
function diceSimilarity(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  let overlap = 0;
  for (const [gram, countA] of gramsA) {
    const countB = gramsB.get(gram);
    if (countB) overlap += Math.min(countA, countB);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/**
 * @param {Array<{source: string, title: string, url: string, publishedAt: Date|string}>} items
 * @returns {Array<Array<object>>} クラスタの配列。各クラスタは渡されたitemオブジェクト
 *   そのものの配列で、クラスタ内は新しい順、クラスタ同士は代表記事（最新）の新しい順。
 */
function clusterItems(items) {
  const n = items.length;

  // Union-Find。常に小さいインデックスを根にし、入力順に依存した決定的な結果にする。
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const urlKeys = items.map((item) => canonicalUrl(item.url));
  const titleKeys = items.map((item) => titleKey(item.title));

  // 1) URL正規化キーが同じもの同士は同一記事
  const byUrl = new Map();
  urlKeys.forEach((key, i) => {
    if (!key) return;
    if (byUrl.has(key)) union(byUrl.get(key), i);
    else byUrl.set(key, i);
  });

  // 2) タイトルの完全一致・あいまい一致（最大100件程度の想定なのでO(n^2)で十分）
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = titleKeys[i];
      const b = titleKeys[j];
      if (a === b && a.length >= MIN_EXACT_KEY_LENGTH) {
        union(i, j);
      } else if (
        a.length >= MIN_FUZZY_KEY_LENGTH &&
        b.length >= MIN_FUZZY_KEY_LENGTH &&
        digitSignature(a) === digitSignature(b) &&
        diceSimilarity(a, b) >= SIMILARITY_THRESHOLD
      ) {
        union(i, j);
      }
    }
  }

  // 根ごとにまとめる。Mapの挿入順＝初出順なので、後段の安定ソートと合わせて
  // 同時刻タイの並びも決定的になる。
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  const time = (item) => {
    const t = new Date(item.publishedAt).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const clusters = [...groups.values()].map((indices) =>
    indices
      .slice()
      .sort((x, y) => time(items[y]) - time(items[x]) || x - y)
      .map((i) => items[i]),
  );
  // 代表記事＝各クラスタ先頭（最新）。その新しい順にクラスタを並べる。
  clusters.sort((c1, c2) => time(c2[0]) - time(c1[0]));
  return clusters;
}

module.exports = { clusterItems };
