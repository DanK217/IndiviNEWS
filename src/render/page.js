const SOURCE_COLORS = {
  "Hacker News": "#ff6600",
  はてなブックマーク: "#00a4de",
  Zenn: "#3ea8ff",
  Publickey: "#22b573",
};
const DEFAULT_COLOR = "#8a8a8a";
const FEATURED_COUNT = 3;

function colorForSource(source) {
  return SOURCE_COLORS[source] || DEFAULT_COLOR;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeAgo(publishedAt) {
  const diffMs = Date.now() - new Date(publishedAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}日前`;
}

function updatedTimeJst() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function renderItem(item) {
  const color = colorForSource(item.source);
  return `
        <li class="item" style="--src:${color}">
          <a class="item-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <div class="meta">
              <span class="badge"><span class="dot"></span><span class="source">${escapeHtml(item.source)}</span></span>
              <span class="time">${escapeHtml(timeAgo(item.publishedAt))}</span>
            </div>
            <div class="title">${escapeHtml(item.title)}</div>
            <span class="go">記事を開く →</span>
          </a>
        </li>`;
}

function renderPage(items) {
  const featured = items.slice(0, FEATURED_COUNT).map(renderItem).join("");
  const rest = items.slice(FEATURED_COUNT).map(renderItem).join("");
  const updated = escapeHtml(updatedTimeJst());
  const hasRest = rest.length > 0;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IndiviNEWS</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    min-height: 100vh;
    background: #000;
    color: #f2f2f2;
    font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* =========================================================================
     設計の要点:
     Widgetsmithはページを縦長でレンダリングして「上部」だけを切り取る。しかも
     ウィジェットのビューポートは実ブラウザ（スマホ）と同じため、メディアクエリでは
     両者を区別できない。そこで区別に頼らず、ページ上部を常に「注目3件のコンパクト
     表示」にしてウィジェットの切り取り領域に収め、リッチなカード一覧はその下
     （スクロールで見える位置）に置く。どの環境でもウィジェットは3件を表示する。
     ========================================================================= */
  .wrap {
    max-width: 940px;
    margin: 0 auto;
    padding: 16px 16px 44px;
  }

  /* ---- ブランドヘッダー（コンパクト。ウィジェット切り取り領域の一番上） ---- */
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 11px;
    padding-bottom: 9px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .brand-bar {
    width: 4px;
    height: 15px;
    border-radius: 2px;
    background: #ff5b3d;
    flex: none;
  }
  .brand-name {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.01em;
    color: #fff;
  }
  .brand-tagline { display: none; }
  .brand-updated {
    margin-left: auto;
    font-size: 10.5px;
    color: #7c7c7c;
    white-space: nowrap;
  }

  /* ---- 注目3件（コンパクト行。ここがウィジェットに写る） ---- */
  ul.featured { list-style: none; }
  .featured .item { padding: 8px 0; }
  .featured .item + .item { border-top: 1px solid rgba(255, 255, 255, 0.09); }
  .item-link {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-decoration: none;
    color: inherit;
    min-width: 0;
  }
  .meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .badge { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--src);
    flex: none;
  }
  .source {
    font-size: 12px;
    font-weight: 700;
    color: var(--src);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time { font-size: 10.5px; color: #767676; margin-left: auto; flex: none; padding-left: 8px; }
  .featured .title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.32;
    color: #f2f2f2;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .go { display: none; }

  /* ---- 区切り（「MORE」）。ウィジェット切り取り領域より下 ---- */
  .more {
    display: ${hasRest ? "flex" : "none"};
    align-items: center;
    gap: 12px;
    margin: 24px 0 14px;
  }
  .more-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: #8a8a8a;
    white-space: nowrap;
  }
  .more-line { flex: 1; height: 1px; background: rgba(255, 255, 255, 0.1); }

  /* ---- 続きのニュース（リッチなカード。開いた時に見える） ---- */
  ul.rest {
    list-style: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .rest .item {
    min-width: 0;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.028);
    border: 1px solid rgba(255, 255, 255, 0.07);
    position: relative;
    overflow: hidden;
    transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .rest .item::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--src);
    opacity: 0.85;
  }
  .rest .item:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
  }
  .rest .item-link { gap: 11px; padding: 16px 18px 15px; height: 100%; }
  .rest .badge {
    gap: 7px;
    padding: 4px 11px 4px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--src) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--src) 34%, transparent);
  }
  .rest .dot { width: 8px; height: 8px; }
  .rest .source { font-size: 12px; }
  .rest .time { font-size: 12px; color: #7c7c7c; }
  .rest .title {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.5;
    color: #ededed;
    min-width: 0;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .rest .go {
    display: inline-block;
    margin-top: auto;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--src);
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }
  .rest .item:hover .go { opacity: 1; transform: translateX(0); }

  .footer {
    margin-top: 34px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 11.5px;
    color: #6f6f6f;
    text-align: center;
    line-height: 1.8;
  }
  .footer b { color: #9a9a9a; font-weight: 700; }

  /* =========================================================================
     幅の広いブラウザ（デスクトップ／タブレット）だけのリッチ強化。
     ウィジェットは常に狭い（約390px）ので、この分岐はウィジェットに影響しない。
     幅で判定するため、縦長レンダリングのウィジェットが誤発動することもない。
     ========================================================================= */
  @media (min-width: 760px) {
    html, body {
      background: radial-gradient(1200px 620px at 50% -8%, #1a1a1c 0%, #0b0b0c 60%, #070707 100%);
    }
    .wrap { padding: 40px 28px 72px; }

    .brand {
      align-items: flex-start;
      gap: 15px;
      margin-bottom: 26px;
      padding-bottom: 22px;
    }
    .brand-bar { width: 9px; height: 40px; margin-top: 3px; border-radius: 3px;
      background: linear-gradient(180deg, #ff7a54, #ff4f2e); }
    .brand-text { display: flex; flex-direction: column; gap: 6px; flex: 1 1 200px; min-width: 0; }
    .brand-name { font-size: 30px; line-height: 1; }
    .brand-tagline { display: block; font-size: 13.5px; color: #9a9a9a; letter-spacing: 0.03em; }
    .brand-updated { font-size: 12px; align-self: flex-end; }

    .eyebrow { color: #8a8a8a; }
    .featured .item { padding: 12px 0; }
    .featured .title { font-size: 17px; line-height: 1.5; }
    .featured .source, .featured .time { font-size: 12.5px; }

    .more { margin: 30px 0 16px; }

    ul.rest { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
    .rest .item-link { padding: 20px 22px 18px; }
    .rest .title { font-size: 16.5px; }

    .footer { margin-top: 44px; font-size: 12px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <span class="brand-bar"></span>
      <div class="brand-text">
        <span class="brand-name">IndiviNEWS</span>
        <span class="brand-tagline">Hacker News・はてなブックマーク・Zenn・Publickey を横断</span>
      </div>
      <span class="brand-updated">更新 ${updated}</span>
    </header>

    <ul class="featured">${featured}
    </ul>

    <div class="more">
      <span class="more-label eyebrow">MORE STORIES</span>
      <span class="more-line"></span>
    </div>

    <ul class="rest">${rest}
    </ul>

    <footer class="footer">
      <b>IndiviNEWS</b> — 個人用テックニュース・ダイジェスト<br>
      30分ごとに自動更新 ／ 要約・選定はルールベース（LLM不使用・運用コスト0円）<br>
      <a href="/trends" style="color:#8a8a8a">📊 トレンド分析を見る →</a>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderPage };
