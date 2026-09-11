/*
 * keywords.js — ニュース見出しから技術キーワードを抽出する（依存なし・実行時LLM不使用）。
 *
 * 日本語の形態素解析は行わない（新規依存を持ち込まない方針、かつ技術トレンドの
 * 信号はASCII語に強く出るため）。代わりに:
 *   1) 記号を含む特殊語（.NET, C++, C#, Node.js, GPT-6 等）を既知パターンで拾う
 *   2) 残りをASCII単語としてトークン化し、ストップワードと別名を正規化する
 * 1見出しにつき各キーワードは1回だけ数える（見出し内の重複で水増ししない）。
 */

// 記号入り・大文字小文字を保ちたい特殊語。canonical が集計・表示のキーになる。
const KNOWN_TERMS = [
  [/\.net\b/i, ".NET"],
  [/\bc\+\+/i, "C++"],
  [/\bc#/i, "C#"],
  [/\bf#/i, "F#"],
  [/\bnode\.js\b/i, "Node.js"],
  [/\bnext\.js\b/i, "Next.js"],
  [/\bvue\.js\b/i, "Vue.js"],
  [/\bgpt-?6\b/i, "GPT-6"],
  [/\bgpt-?5\b/i, "GPT-5"],
  [/\bgpt-?4\b/i, "GPT-4"],
  [/\bclaude\b/i, "Claude"],
  [/\bpython\s?2(\.7)?\b/i, "Python2"],
  [/\bpython\s?3\b/i, "Python3"],
];

// ASCII単語の別名 → 正規表記（小文字キーで照合）。表記ゆれや略称を束ねる。
const ALIASES = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  golang: "Go",
  ai: "AI",
  llm: "LLM",
  llms: "LLM",
  aws: "AWS",
  gcp: "GCP",
  ios: "iOS",
  macos: "macOS",
  api: "API",
  apis: "API",
  css: "CSS",
  html: "HTML",
  sql: "SQL",
  gpu: "GPU",
  cpu: "CPU",
  os: "OS",
  ui: "UI",
  ux: "UX",
  cli: "CLI",
  sdk: "SDK",
  db: "database",
};

// 技術トレンドの信号にならない一般的な英語語・汎用語。小文字で照合。
const STOPWORDS = new Set([
  // 冠詞・前置詞・接続詞・代名詞など
  "the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "at",
  "by", "with", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "it", "its", "this", "that", "these", "those", "you", "your", "we", "our",
  "my", "me", "us", "they", "them", "their", "he", "she", "his", "her",
  "how", "why", "what", "when", "where", "who", "which", "whose",
  "can", "will", "would", "should", "could", "may", "might", "must",
  "has", "have", "had", "do", "does", "did", "done",
  "not", "no", "yes", "if", "then", "than", "so", "such", "too", "very",
  "into", "out", "up", "down", "over", "under", "about", "after", "before",
  "more", "most", "less", "all", "any", "some", "each", "every", "both",
  "one", "two", "three", "first", "second", "next", "last", "just", "only",
  "like", "via", "vs", "etc", "et", "al",
  // 見出しで多用される汎用語（技術名ではない）
  "new", "now", "get", "got", "getting", "make", "making", "made", "use",
  "using", "used", "build", "building", "built", "how-to", "guide", "intro",
  "introduction", "tutorial", "part", "series", "way", "ways", "thing",
  "things", "stuff", "everything", "something", "anything", "nothing",
  "day", "days", "week", "weeks", "year", "years", "time", "times",
  "release", "released", "releases", "update", "updated", "updates",
  "support", "supports", "supported", "version", "versions",
  "show", "hn", "ask", "tell", "read", "post", "blog", "article",
  "best", "top", "good", "great", "better", "vs.",
  "open", "pr", // open source の断片 / PR（曖昧・汎用）はノイズになりやすい
]);

const GENERIC_TOKEN_RE = /[A-Za-z][A-Za-z0-9]+/g;

// 見出し1件からキーワード配列（重複なし・canonical表記）を返す。
function extractFromTitle(title, displayMap) {
  const found = new Set();
  const add = (canonical) => {
    const key = canonical.toLowerCase();
    if (!displayMap.has(key)) displayMap.set(key, canonical);
    found.add(key);
  };

  for (const [re, canonical] of KNOWN_TERMS) {
    if (re.test(title)) add(canonical);
  }

  const tokens = title.match(GENERIC_TOKEN_RE) || [];
  for (const tok of tokens) {
    const lw = tok.toLowerCase();
    if (STOPWORDS.has(lw)) continue;
    if (/^\d+$/.test(tok)) continue; // 純粋な数字列は除外
    if (ALIASES[lw]) {
      add(ALIASES[lw]);
    } else {
      // 既知の特殊語で拾ったもの（net/gpt等の断片）と二重にならないよう軽く除外
      if (lw === "net" || lw === "js" || /^gpt$/.test(lw)) continue;
      add(tok); // 初出の表記（OpenAI, AWS 等の内部大文字を保つ）
    }
  }

  return [...found]; // 小文字キーの配列
}

// 項目配列 → { key -> count }（1見出し1カウント）と表示表記マップを返す。
function tallyKeywords(items) {
  const counts = new Map();
  const displayMap = new Map();
  for (const item of items) {
    for (const key of extractFromTitle(item.title, displayMap)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return { counts, displayMap };
}

module.exports = { extractFromTitle, tallyKeywords, STOPWORDS, ALIASES };
