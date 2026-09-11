/*
 * trends-page.js — data/trends.json からトレンドダッシュボードHTMLを生成する純粋関数。
 *
 * 依存なし。チャートはHTML/CSSバー＋インラインSVGスパークラインで描く
 * （チャートライブラリを足さない＝新規依存なし・CSP安全・完全レスポンシブ）。
 * サイト本体（page.js）と同じダーク配色・ソース色に揃える。
 */

const SOURCE_COLORS = {
  "Hacker News": "#ff6600",
  はてなブックマーク: "#00a4de",
  Zenn: "#3ea8ff",
  Publickey: "#22b573",
};
const ACCENT = "#3987e5"; // キーワードバーの単一系列色（datavizバリデータ済みの青）
const BRAND = "#ff5b3d";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function colorForSource(s) {
  return SOURCE_COLORS[s] || "#8a8a8a";
}

function statTile(value, label) {
  return `<div class="tile"><div class="tile-v">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;
}

function rankingRows(keywordTotal) {
  const max = keywordTotal.length ? keywordTotal[0].count : 1;
  return keywordTotal
    .map((k, i) => {
      const pct = Math.max((k.count / max) * 100, 1.5);
      return `
      <div class="rk">
        <span class="rk-n">${i + 1}</span>
        <span class="rk-term">${escapeHtml(k.term)}</span>
        <span class="rk-track"><span class="rk-bar" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="rk-val">${k.count}</span>
      </div>`;
    })
    .join("");
}

// 週次カウント配列 → 面スパークラインSVG（各系列で自前スケール、形状を見せる）
function sparkline(weekly) {
  const w = 100;
  const h = 34;
  const pad = 2;
  const max = Math.max(1, ...weekly);
  const n = weekly.length;
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const pts = weekly.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `${pad},${h} ${pts.join(" ")} ${w - 0},${h}`;
  const line = pts.join(" ");
  const lastX = x(n - 1).toFixed(1);
  const lastY = y(weekly[n - 1]).toFixed(1);
  return `
    <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${area}" fill="${ACCENT}" fill-opacity="0.16"></polygon>
      <polyline points="${line}" fill="none" stroke="${ACCENT}" stroke-width="1.6" vector-effect="non-scaling-stroke"></polyline>
      <circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${ACCENT}"></circle>
    </svg>`;
}

function trendCards(keywordTrend, weekLabels) {
  const first = weekLabels[0] || "";
  const last = weekLabels[weekLabels.length - 1] || "";
  return keywordTrend
    .map((t) => {
      const peak = Math.max(...t.weekly);
      return `
      <div class="tc">
        <div class="tc-head">
          <span class="tc-term">${escapeHtml(t.term)}</span>
          <span class="tc-total">${t.total}</span>
        </div>
        ${sparkline(t.weekly)}
        <div class="tc-foot"><span>${escapeHtml(first)}</span><span class="tc-peak">最大 ${peak}/週</span><span>${escapeHtml(last)}</span></div>
      </div>`;
    })
    .join("");
}

function longevityRows(longevity) {
  return longevity
    .map((l) => {
      const chips = l.sources
        .map(
          (s) =>
            `<span class="chip" style="--c:${colorForSource(s)}">${escapeHtml(s)}</span>`,
        )
        .join("");
      return `
      <li class="lv">
        <span class="lv-days"><b>${l.days}</b><span>日</span></span>
        <div class="lv-main">
          <a class="lv-title" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.title)}</a>
          <div class="lv-src">${chips}</div>
        </div>
      </li>`;
    })
    .join("");
}

function renderTrendsPage(data) {
  if (!data || !data.range) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>IndiviNEWS トレンド</title></head><body style="background:#000;color:#ccc;font-family:sans-serif;padding:40px">トレンドデータがまだありません。</body></html>`;
  }

  const { range, totals } = data;
  const genJst = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(data.generatedAt));

  const aiTop = data.keywordTotal.find((k) => k.term === "AI");
  const aiShare = aiTop ? Math.round((aiTop.count / totals.headlines) * 100) : null;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IndiviNEWS トレンド</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { color-scheme: dark; }
  html, body {
    min-height:100vh;
    color:#ededed;
    background:
      radial-gradient(1100px 560px at 50% -10%, #17171a 0%, #0b0b0c 58%, #070708 100%);
    font-family:-apple-system,"Hiragino Sans","Yu Gothic",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  a { color:inherit; }
  .wrap { max-width:960px; margin:0 auto; padding:34px 18px 72px; }

  .top { display:flex; align-items:flex-start; gap:14px; margin-bottom:8px; }
  .top-bar { width:8px; height:38px; border-radius:3px; margin-top:3px;
    background:linear-gradient(180deg,#ff7a54,#ff4f2e); flex:none; }
  .top h1 { font-size:26px; font-weight:800; letter-spacing:.01em; line-height:1.1; }
  .top .sub { font-size:13px; color:#9a9a9a; margin-top:6px; }
  .top .back { margin-left:auto; font-size:12.5px; color:#8a8a8a; text-decoration:none;
    border:1px solid rgba(255,255,255,.14); border-radius:999px; padding:6px 13px; white-space:nowrap; }
  .top .back:hover { color:#fff; border-color:rgba(255,255,255,.3); }

  .tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:22px 0 6px; }
  .tile { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
    border-radius:12px; padding:15px 16px; }
  .tile-v { font-size:26px; font-weight:800; letter-spacing:.01em; }
  .tile-l { font-size:12px; color:#8f8f8f; margin-top:4px; }

  section { margin-top:34px; }
  .sec-head { display:flex; align-items:baseline; gap:12px; margin-bottom:16px; }
  .sec-head h2 { font-size:18px; font-weight:700; }
  .sec-head .note { font-size:12px; color:#7c7c7c; }

  .card { background:rgba(255,255,255,.028); border:1px solid rgba(255,255,255,.07);
    border-radius:16px; padding:20px 22px; }

  /* ランキング（HTML/CSSバー） */
  .rk { display:flex; align-items:center; gap:12px; padding:5px 0; }
  .rk-n { width:22px; text-align:right; font-size:12px; color:#6f6f6f; font-variant-numeric:tabular-nums; flex:none; }
  .rk-term { width:120px; font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:none; }
  .rk-track { flex:1; height:12px; background:rgba(255,255,255,.05); border-radius:6px; overflow:hidden; min-width:40px; }
  .rk-bar { display:block; height:100%; border-radius:6px;
    background:linear-gradient(90deg,#2a6fce,#3987e5); }
  .rk-val { width:40px; text-align:right; font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; color:#dcdcdc; flex:none; }

  /* 週次推移スモールマルチプル */
  .tcs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .tc { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
    border-radius:12px; padding:12px 13px 10px; }
  .tc-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
  .tc-term { font-size:13.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tc-total { font-size:13px; font-weight:800; color:${ACCENT}; font-variant-numeric:tabular-nums; }
  .spark { display:block; width:100%; height:34px; margin:8px 0 6px; }
  .tc-foot { display:flex; justify-content:space-between; gap:6px; font-size:10px; color:#6f6f6f; }
  .tc-peak { color:#8a8a8a; }

  /* 話題の寿命 */
  ul.lvs { list-style:none; display:flex; flex-direction:column; }
  .lv { display:flex; gap:14px; align-items:flex-start; padding:12px 0; }
  .lv + .lv { border-top:1px solid rgba(255,255,255,.07); }
  .lv-days { flex:none; width:52px; text-align:center; }
  .lv-days b { display:block; font-size:22px; font-weight:800; color:${BRAND}; line-height:1; font-variant-numeric:tabular-nums; }
  .lv-days span { font-size:10.5px; color:#7c7c7c; }
  .lv-main { min-width:0; }
  .lv-title { font-size:14.5px; font-weight:600; line-height:1.5; text-decoration:none;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .lv-title:hover { text-decoration:underline; }
  .lv-src { margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:10.5px; font-weight:700; color:var(--c);
    border:1px solid color-mix(in srgb, var(--c) 34%, transparent);
    background:color-mix(in srgb, var(--c) 15%, transparent);
    border-radius:999px; padding:2px 9px; }

  .footer { margin-top:40px; padding-top:20px; border-top:1px solid rgba(255,255,255,.08);
    font-size:11.5px; color:#6f6f6f; line-height:1.9; }
  .footer b { color:#9a9a9a; }

  @media (max-width:640px) {
    .tiles { grid-template-columns:repeat(2,1fr); }
    .tcs { grid-template-columns:repeat(2,1fr); }
    .rk-term { width:92px; font-size:13px; }
    .top h1 { font-size:22px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <span class="top-bar"></span>
      <div>
        <h1>IndiviNEWS トレンド</h1>
        <div class="sub">${escapeHtml(range.from)} 〜 ${escapeHtml(range.to)}（${range.days}日分・${totals.headlines}見出し）を集計 ／ 更新 ${escapeHtml(genJst)}</div>
      </div>
      <a class="back" href="/">← ニュース一覧</a>
    </div>

    <div class="tiles">
      ${statTile(String(totals.headlines), "収集した見出し")}
      ${statTile(String(range.days), "集計日数")}
      ${statTile(aiShare != null ? aiShare + "%" : "—", "「AI」を含む割合")}
      ${statTile(String(totals.keywords), "ユニーク技術語")}
    </div>

    <section>
      <div class="sec-head"><h2>キーワードランキング</h2><span class="note">出現見出し数（1見出し1カウント・上位${data.keywordTotal.length}）</span></div>
      <div class="card">${rankingRows(data.keywordTotal)}</div>
    </section>

    <section>
      <div class="sec-head"><h2>注目キーワードの週次推移</h2><span class="note">上位${data.keywordTrend.length}語・週ごとの出現数</span></div>
      <div class="tcs">${trendCards(data.keywordTrend, data.keywordTrendWeeks)}</div>
    </section>

    <section>
      <div class="sec-head"><h2>長く居座った話題</h2><span class="note">同一記事が登場した日数（複数ソース横断含む）</span></div>
      <div class="card"><ul class="lvs">${longevityRows(data.longevity)}</ul></div>
    </section>

    <footer class="footer">
      <b>集計方法</b>：蓄積した日次ダイジェスト（Hacker News・はてなブックマーク・Zenn・Publickey）の見出しを、ルールベースで集計。キーワードはASCII技術語を対象（日本語形態素解析は不使用）。各週の端は日数が少ないため件数が下がる点に注意。<br>
      <b>IndiviNEWS</b> — LLM不使用・運用コスト0円で自動集計 ／ <a href="/" style="color:#8a8a8a">ニュース一覧へ</a>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderTrendsPage };
