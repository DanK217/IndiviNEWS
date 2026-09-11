/*
 * parse-digests.js — 蓄積された digests/YYYY-MM-DD.md を構造化データに変換する。
 *
 * 依存なし（Node標準のみ）。build-digest.js が生成する Markdown の
 * 「## <ソース名>」セクション配下の項目行だけを対象にする:
 *   - [タイトル](URL) — M/D HH:MM（任意の注記）
 * 「## 今日のピック」の行は "- **[" 始まりなので項目行の正規表現に一致せず、
 * 自然に二重計上されない（ピックはソース別項目の部分集合のため除外が正しい）。
 */
const fs = require("fs");
const path = require("path");

const DIGEST_DIR = path.join(__dirname, "..", "..", "digests");

// ソース別項目行: 先頭の "- [" に厳密一致（ピックの "- **[" は弾く）。
// タイトルには全角括弧【】「」等が入りうるが ASCII の "](" は
// Markdownリンク境界にしか現れないため、貪欲一致 + "](" で正しく分割できる。
const ITEM_RE = /^- \[(.+)\]\((\S+)\) — (.+)$/;
// 末尾の「M/D HH:MM」だけを時刻として取り出す（後続の「（…で話題）」注記は無視）。
const TIME_RE = /^(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2})/;

const DATE_FILE_RE = /^(\d{4})-(\d{2})-(\d{2})\.md$/;

function parseDigest(markdown, date) {
  const items = [];
  let currentSource = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1];
      // 「今日のピック」や区切り以外の見出しをソース名として扱う。
      currentSource = name === "今日のピック" ? null : name;
      continue;
    }

    if (!currentSource) continue;

    const m = ITEM_RE.exec(line);
    if (!m) continue;

    const [, title, url, rest] = m;
    const tm = TIME_RE.exec(rest);
    items.push({
      date, // ダイジェストの日付（YYYY-MM-DD、ファイル名由来で信頼できる）
      source: currentSource,
      title: title.trim(),
      url: url.trim(),
      time: tm ? `${tm[3]}:${tm[4]}` : null, // 掲載時刻 HH:MM（無ければnull）
    });
  }

  return { date, items };
}

// digests/ 配下の YYYY-MM-DD.md をすべて読み、日付昇順で {date, items} を返す。
function loadAllDigests(dir = DIGEST_DIR) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => DATE_FILE_RE.test(f))
    .sort()
    .map((f) => {
      const date = f.slice(0, 10);
      const md = fs.readFileSync(path.join(dir, f), "utf-8");
      return parseDigest(md, date);
    });
}

// 全ダイジェストを平坦化した項目配列（各項目に date を保持）。
function loadAllItems(dir = DIGEST_DIR) {
  return loadAllDigests(dir).flatMap((d) => d.items);
}

module.exports = { parseDigest, loadAllDigests, loadAllItems, DIGEST_DIR };
