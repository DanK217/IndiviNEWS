const SOURCE_COLORS = {
  "Hacker News": "#ff6600",
  はてなブックマーク: "#00a4de",
  Zenn: "#3ea8ff",
  Publickey: "#22b573",
};
const DEFAULT_COLOR = "#8a8a8a";

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
              <span class="badge">
                <span class="dot"></span>
                <span class="source">${escapeHtml(item.source)}</span>
              </span>
              <span class="time">${escapeHtml(timeAgo(item.publishedAt))}</span>
            </div>
            <div class="title">${escapeHtml(item.title)}</div>
            <span class="go">記事を開く →</span>
          </a>
        </li>`;
}

function renderPage(items) {
  const rows = items.map(renderItem).join("");
  const updated = escapeHtml(updatedTimeJst());

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
    overflow: hidden;
  }

  /* =========================================================================
     既定 = ウィジェット用コンパクト表示。
     Widgetsmithのスナップショットは実際のレンダリング高さ全体ではなくページ
     「上部」だけを切り取る。そのため縦中央寄せは使わず、コンテンツを常に
     左上（top:0）に固定し、サイズは幅(vw)基準にする。ページには複数件流し込むが、
     ウィジェットには上部数件だけが写る。この既定表示は従来の見た目を維持する。
     ========================================================================= */
  .wrap {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 3.4vw 4.2vw 2vw;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 1.6vw;
    margin-bottom: 2.6vw;
  }
  .header-bar {
    width: 1vw;
    height: 1vw;
    min-width: 6px;
    min-height: 6px;
    border-radius: 2px;
    background: #ff5b3d;
    flex: none;
  }
  .header-label {
    font-size: clamp(9px, 2.6vw, 13px);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
    color: #9a9a9a;
  }
  .brand-full, .tagline, .updated, .go, .footer { display: none; }

  ul.list { list-style: none; display: flex; flex-direction: column; }
  li.item { padding: 2vw 0; }
  li.item + li.item { border-top: 1px solid rgba(255, 255, 255, 0.09); }
  a.item-link {
    display: flex;
    flex-direction: column;
    gap: 1vw;
    text-decoration: none;
    color: inherit;
  }
  .meta { display: flex; align-items: center; gap: 1.4vw; min-width: 0; }
  .badge { display: inline-flex; align-items: center; gap: 1.4vw; min-width: 0; }
  .dot {
    width: 1.6vw;
    height: 1.6vw;
    min-width: 7px;
    min-height: 7px;
    border-radius: 50%;
    background: var(--src);
    flex: none;
  }
  .source {
    font-size: clamp(9px, 2.6vw, 13px);
    font-weight: 700;
    color: var(--src);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time {
    font-size: clamp(8px, 2.2vw, 11px);
    color: #767676;
    margin-left: auto;
    flex: none;
    padding-left: 1.4vw;
  }
  .title {
    font-size: clamp(13px, 4.4vw, 20px);
    font-weight: 600;
    line-height: 1.32;
    color: #f5f5f5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* =========================================================================
     リッチ表示。ウィジェットのスナップショット領域（およそ 338x158）より明確に
     大きいビューポート = 実ブラウザで開いた時にのみ適用する。幅・高さの
     どちらかが 500px を超えれば実ブラウザとみなす（ウィジェットはどちらも未満）。
     ========================================================================= */
  @media (min-width: 500px), (min-height: 500px) {
    html, body {
      overflow-x: hidden;
      overflow-y: auto;
      min-height: 100%;
      background:
        radial-gradient(1200px 620px at 50% -8%, #1c1c1e 0%, #0c0c0d 58%, #070707 100%);
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      position: static;
      max-width: 960px;
      margin: 0 auto;
      padding: 48px 24px 72px;
    }

    .header {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin-bottom: 34px;
      padding-bottom: 26px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .header-bar {
      width: 10px;
      height: 38px;
      min-width: 10px;
      min-height: 38px;
      border-radius: 3px;
      margin-top: 4px;
      background: linear-gradient(180deg, #ff7a54, #ff4f2e);
    }
    .header-text { display: flex; flex-direction: column; gap: 6px; flex: 1 1 200px; min-width: 0; }
    .header-label { display: none; }
    .brand-full {
      display: block;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 0.01em;
      color: #fff;
      line-height: 1;
    }
    .tagline {
      display: block;
      font-size: 14px;
      letter-spacing: 0.04em;
      color: #9a9a9a;
    }
    .updated {
      display: block;
      margin-left: auto;
      align-self: flex-end;
      font-size: 12px;
      color: #7c7c7c;
      white-space: nowrap;
      padding-top: 4px;
    }

    ul.list {
      display: grid;
      /* minmax(0,1fr) はグリッドのトラック最小幅を min-content ではなく 0 にする。
         これがないと長いタイトル等でトラックが膨張し横スクロールが発生する。 */
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      min-width: 0;
    }
    li.item {
      padding: 0;
      min-width: 0;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.028);
      border: 1px solid rgba(255, 255, 255, 0.07);
      transition: transform 0.15s ease, border-color 0.15s ease,
        background 0.15s ease;
      overflow: hidden;
      position: relative;
    }
    li.item::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--src);
      opacity: 0.85;
    }
    li.item + li.item { border-top: 1px solid rgba(255, 255, 255, 0.07); }
    li.item:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.05);
    }

    a.item-link { gap: 12px; padding: 20px 22px 18px; height: 100%; min-width: 0; }

    .meta { gap: 10px; }
    .badge { max-width: 100%; }
    .badge {
      gap: 7px;
      padding: 4px 11px 4px 9px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--src) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--src) 34%, transparent);
    }
    .dot { width: 8px; height: 8px; min-width: 8px; min-height: 8px; }
    .source { font-size: 12px; letter-spacing: 0.02em; }
    .time {
      font-size: 12px;
      color: #7c7c7c;
      padding-left: 8px;
    }
    .title {
      font-size: 17px;
      font-weight: 600;
      line-height: 1.5;
      color: #ededed;
      min-width: 0;
      overflow-wrap: anywhere;
      -webkit-line-clamp: 3;
    }
    .go {
      display: inline-block;
      margin-top: auto;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--src);
      opacity: 0;
      transform: translateX(-4px);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    li.item:hover .go { opacity: 1; transform: translateX(0); }

    /* 先頭記事はヒーローとして大きく見せる */
    li.item:first-child a.item-link { padding: 26px 26px 24px; }
    li.item:first-child .title {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.42;
      color: #fff;
      -webkit-line-clamp: 3;
    }

    .footer {
      display: block;
      margin-top: 40px;
      padding-top: 22px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #6f6f6f;
      text-align: center;
      line-height: 1.8;
    }
    .footer b { color: #9a9a9a; font-weight: 700; }
  }

  /* 2カラム化（先頭ヒーローは全幅） */
  @media (min-width: 860px) {
    ul.list { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    li.item:first-child { grid-column: 1 / -1; }
    li.item:first-child .title { font-size: 28px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="header">
      <span class="header-bar"></span>
      <div class="header-text">
        <span class="header-label">Tech News</span>
        <span class="brand-full">IndiviNEWS</span>
        <span class="tagline">Hacker News・はてなブックマーク・Zenn・Publickey を横断</span>
      </div>
      <span class="updated">最終更新 ${updated} JST</span>
    </header>
    <ul class="list">${rows}
    </ul>
    <footer class="footer">
      <b>IndiviNEWS</b> — 個人用テックニュース・ダイジェスト<br>
      30分ごとに自動更新 ／ 要約・選定はルールベース（LLM不使用・運用コスト0円）
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderPage };
