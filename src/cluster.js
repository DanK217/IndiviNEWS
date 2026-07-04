/*
 * cluster.js — 複数ニュースソース間で「同じ記事／同じ話題」の見出しをまとめる。
 *
 * IndiviNEWSの制約に従い、LLMや外部ネットワークは一切使わずルールベースで判定する
 * （運用コスト0円の維持）。想定入力は最大100件程度のため、素朴な総当たり比較で十分。
 *
 * 判定の考え方:
 *   1. URL正規化キーが一致 → 同一記事（プロトコル揺れ・www・末尾スラッシュ・
 *      追跡用クエリの有無を吸収する）
 *   2. タイトル正規化キーが一致 → 同一話題（全角/半角・大小文字・装飾・
 *      サイト名サフィックスを吸収する）
 *   3. タイトルのbigram類似度が高い → 同一話題（軽微な表記揺れの近似一致）
 *      ※ 別話題の誤結合を避けるため高いしきい値にし、日本語⇔英語はまたがない。
 *
 * これらの関係をUnion-Findで連結し、連結成分をクラスタとして返す。
 */

// URLから取り除く追跡用パラメータ（値が記事の同一性に影響しないもの）。
// utm_* は前方一致で別途除去する。
const TRACKING_PARAMS = new Set([
  "ref",
  "ref_src",
  "ref_url",
  "referrer",
  "source",
  "cmpid",
  "feature",
  "spm",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "cid",
  "trk",
]);

// タイトル末尾から取り除くサイト名サフィックス（NFKC・小文字化後に照合）。
// 同一記事が別ソースに流れると「 - Qiita」等が付くことがあるため。
const SITE_SUFFIXES = new Set([
  "qiita",
  "zenn",
  "note",
  "publickey",
  "publickey1",
  "はてなブックマーク",
  "はてな",
  "hatena",
  "hacker news",
  "hackernews",
  "ycombinator",
  "y combinator",
  "gigazine",
  "itmedia",
  "itmedia news",
  "gihyo.jp",
  "gihyo",
  "infoq",
  "publickey",
  "techcrunch",
  "the verge",
  "ars technica",
  "engadget",
  "gizmodo",
  "cnet",
  "cnet japan",
  "medium",
  "dev.to",
  "github",
  "speaker deck",
  "slideshare",
  "togetter",
  "note.com",
  "日経クロステック",
  "日経xtech",
  "smartnews",
]);

// 装飾ラベル（【速報】〔PR〕[更新] 等）を除去する。
const DECORATION_RE = /【[^】]*】|〔[^〕]*〕|［[^］]*］/g;
const LEADING_BRACKET_RE = /^\s*\[[^\]]*\]\s*/;
// タイトル末尾のサイト名サフィックスを切り出すための区切り。
const SUFFIX_SEP_RE = /\s*[-|/:｜–—―]\s*([^\-|/:｜–—―]+)$/;

const CJK_RE = /[぀-ヿ㐀-鿿豈-﫿]/;

function toTime(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// URLをホスト+パス+意味のあるクエリに正規化する。プロトコル・www・フラグメント・
// 末尾スラッシュ・追跡パラメータの違いを吸収する。
function normalizeUrl(raw) {
  if (raw == null) return "";
  try {
    const u = new URL(String(raw).trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    let pathname = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    if (pathname === "") pathname = "/";

    const kept = [];
    for (const [key, value] of new URLSearchParams(u.search)) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) continue;
      kept.push([lower, value]);
    }
    kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
    const search = kept.length
      ? "?" + kept.map(([k, v]) => `${k}=${v}`).join("&")
      : "";

    return `${host}${pathname}${search}`;
  } catch {
    // URLとして解釈できない場合は素朴に整形して比較する。
    return String(raw).trim().toLowerCase().replace(/\/+$/, "");
  }
}

// タイトルを比較用のキーに正規化する。
// NFKC（全角→半角・半角カナ→全角）、小文字化、装飾除去、サイト名サフィックス除去、
// 記号・空白の除去まで行い、表記揺れを吸収する。
function normalizeTitle(rawTitle) {
  if (rawTitle == null) return "";
  let s = String(rawTitle).normalize("NFKC").toLowerCase();
  s = s.replace(DECORATION_RE, " ");
  s = s.replace(LEADING_BRACKET_RE, "");

  // 末尾が既知サイト名なら繰り返し取り除く（" - Qiita" 等）。
  for (let i = 0; i < 3; i++) {
    const m = s.match(SUFFIX_SEP_RE);
    if (m && SITE_SUFFIXES.has(m[1].trim())) {
      s = s.slice(0, m.index);
    } else {
      break;
    }
  }

  // 記号・空白・区切りをすべて落とし、内容文字だけのキーにする。
  s = s.replace(/[\s\p{P}\p{S}]/gu, "");
  return s;
}

// 文字bigramの集合を返す（キーが十分短い場合は文字そのものを1要素とする）。
function bigrams(key) {
  const set = new Set();
  if (key.length === 0) return set;
  if (key.length === 1) {
    set.add(key);
    return set;
  }
  for (let i = 0; i < key.length - 1; i++) {
    set.add(key.slice(i, i + 2));
  }
  return set;
}

// Sørensen–Dice係数（0〜1）。
function diceSimilarity(aSet, bSet) {
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let overlap = 0;
  const [small, large] = aSet.size < bSet.size ? [aSet, bSet] : [bSet, aSet];
  for (const g of small) if (large.has(g)) overlap++;
  return (2 * overlap) / (aSet.size + bSet.size);
}

const FUZZY_THRESHOLD = 0.82;

/**
 * @param {Array<{source: string, title: string, url: string, publishedAt: Date|string}>} items
 * @returns {Array<Array<item>>}  クラスタの配列。各クラスタは渡されたitemオブジェクトの配列。
 */
function clusterItems(items) {
  const list = Array.isArray(items) ? items : [];
  const n = list.length;

  // 各アイテムの正規化特徴を事前計算する。
  const features = list.map((item) => {
    const titleKey = normalizeTitle(item && item.title);
    return {
      urlKey: normalizeUrl(item && item.url),
      titleKey,
      grams: bigrams(titleKey),
      hasCjk: CJK_RE.test(String((item && item.title) || "")),
      time: toTime(item && item.publishedAt),
    };
  });

  // Union-Find。
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const a = features[i];
      const b = features[j];

      // 1. 同一URL → 同一記事（言語に関係なく結合）。
      if (a.urlKey && b.urlKey && a.urlKey === b.urlKey) {
        union(i, j);
        continue;
      }
      // タイトルキーが空同士はタイトル比較しない（URL一致のみで判断）。
      if (!a.titleKey || !b.titleKey) continue;

      // 2. 正規化タイトル完全一致 → 同一話題。
      if (a.titleKey === b.titleKey) {
        union(i, j);
        continue;
      }
      // 3. 近似一致。日本語⇔英語はスコープ外なので言語が異なれば比較しない。
      if (a.hasCjk === b.hasCjk) {
        if (diceSimilarity(a.grams, b.grams) >= FUZZY_THRESHOLD) {
          union(i, j);
        }
      }
    }
  }

  // 連結成分ごとにアイテムを集約する。
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  // クラスタ内は新しい順、同時刻は決定的になるようurl→titleで整列。
  function compareIdx(x, y) {
    const fx = features[x];
    const fy = features[y];
    if (fy.time !== fx.time) return fy.time - fx.time;
    if (fx.urlKey !== fy.urlKey) return fx.urlKey < fy.urlKey ? -1 : 1;
    if (fx.titleKey !== fy.titleKey) return fx.titleKey < fy.titleKey ? -1 : 1;
    return x - y;
  }

  const clusters = [];
  for (const indices of groups.values()) {
    indices.sort(compareIdx);
    clusters.push(indices);
  }

  // クラスタ間は代表記事（各クラスタ先頭＝最新）の新しい順。
  clusters.sort((c1, c2) => compareIdx(c1[0], c2[0]));

  return clusters.map((indices) => indices.map((idx) => list[idx]));
}

module.exports = { clusterItems, normalizeUrl, normalizeTitle };
