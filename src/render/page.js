function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(items) {
  const rows = items
    .map(
      (item) => `
        <li class="item">
          <span class="dot"></span>
          <span class="title">${escapeHtml(item.title)}</span>
        </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tech News</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    background: #000;
    color: #f2f2f2;
    font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;
    overflow: hidden;
  }
  .wrap {
    width: 100vw;
    height: 100vh;
    padding: 3vh 4vw;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  ul.list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1.4vh;
  }
  li.item {
    display: flex;
    align-items: baseline;
    gap: 1.2vw;
    min-width: 0;
  }
  .dot {
    flex: none;
    width: 0.8vh;
    height: 0.8vh;
    border-radius: 50%;
    background: #666;
  }
  .title {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: clamp(11px, 3.4vh, 22px);
    line-height: 1.3;
    color: #e8e8e8;
  }
</style>
</head>
<body>
  <div class="wrap">
    <ul class="list">${rows}
    </ul>
  </div>
</body>
</html>`;
}

module.exports = { renderPage };
