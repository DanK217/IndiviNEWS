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

function renderItem(item) {
  const color = colorForSource(item.source);
  return `
        <li class="item">
          <a class="item-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <div class="meta">
              <span class="dot" style="background:${color}"></span>
              <span class="source" style="color:${color}">${escapeHtml(item.source)}</span>
              <span class="time">${escapeHtml(timeAgo(item.publishedAt))}</span>
            </div>
            <div class="title">${escapeHtml(item.title)}</div>
          </a>
        </li>`;
}

function renderPage(items) {
  const rows = items.map(renderItem).join("");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tech News</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    min-height: 100vh;
    background: #000;
    color: #f2f2f2;
    font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;
    overflow: hidden;
  }
  /*
    Widgetsmithのスナップショットは、実際のレンダリング高さ全体ではなく
    ページ「上部」だけを切り取って表示する。そのため縦中央寄せは使わず、
    コンテンツを常にページの左上（top:0）に固定する。サイズ指定も
    高さ(vh)ではなく幅(vw)基準にし、実際に信頼できる横幅にレイアウトを合わせる。
  */
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
  ul.list {
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  li.item {
    padding: 2vw 0;
  }
  li.item + li.item {
    border-top: 1px solid rgba(255, 255, 255, 0.09);
  }
  a.item-link {
    display: flex;
    flex-direction: column;
    gap: 1vw;
    text-decoration: none;
    color: inherit;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 1.4vw;
    min-width: 0;
  }
  .dot {
    width: 1.6vw;
    height: 1.6vw;
    min-width: 7px;
    min-height: 7px;
    border-radius: 50%;
    flex: none;
  }
  .source {
    font-size: clamp(9px, 2.6vw, 13px);
    font-weight: 700;
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
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <span class="header-bar"></span>
      <span class="header-label">Tech News</span>
    </div>
    <ul class="list">${rows}
    </ul>
  </div>
</body>
</html>`;
}

module.exports = { renderPage };
