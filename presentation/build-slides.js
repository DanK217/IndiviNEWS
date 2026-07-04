/*
 * build-slides.js — 発表用スライドHTML（1920x1080・1枚1ファイル）を生成する。
 *
 * PNG化はEdgeのヘッドレススクリーンショットで行う（Office不要・追加依存なし）:
 *   node presentation/build-slides.js
 *   → presentation/html/slide-01.html ... が生成される
 *   → 各HTMLを msedge --headless --screenshot で PNG化（README参照）
 *
 * 配色はdatavizバリデータ検証済み（dark surface #1a1a19、4スロット全PASS、
 * CVDフロア帯のため全バーに直接ラベル併記）。
 */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "html");

// ---- design tokens -------------------------------------------------------
const C = {
  page: "#0d0d0d",
  card: "#1a1a19",
  ink: "#ffffff",
  ink2: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  border: "rgba(255,255,255,0.10)",
  accent: "#ff5b3d", // IndiviNEWSウィジェットのブランド色（チャート系列には使わない）
  fable: "#3987e5",
  opus: "#199e70",
  sonnet: "#c98500",
  haiku: "#008300",
};

const MODELS = [
  { name: "Fable 5", color: C.fable },
  { name: "Opus 4.8", color: C.opus },
  { name: "Sonnet 5", color: C.sonnet },
  { name: "Haiku 4.5", color: C.haiku },
];

// ---- shared shell --------------------------------------------------------
function shell({ kicker, body, num, total }) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1920px; height:1080px; overflow:hidden; }
  body {
    background:${C.page}; color:${C.ink};
    font-family:"Yu Gothic UI","Segoe UI","Hiragino Sans",Meiryo,sans-serif;
    display:flex; flex-direction:column; padding:72px 96px 56px;
  }
  .kicker { display:flex; align-items:center; gap:18px; margin-bottom:44px; }
  .kicker-bar { width:14px; height:14px; border-radius:3px; background:${C.accent}; }
  .kicker-label { font-size:26px; letter-spacing:.18em; font-weight:700; color:${C.muted}; text-transform:uppercase; }
  .body { flex:1; display:flex; flex-direction:column; min-height:0; }
  h1 { font-size:66px; font-weight:700; line-height:1.25; letter-spacing:.01em; }
  h1 .em { color:${C.accent}; }
  .footer { display:flex; justify-content:space-between; align-items:center; margin-top:40px; }
  .footer-left { font-size:22px; color:${C.muted}; }
  .footer-right { font-size:24px; color:${C.muted}; font-variant-numeric:tabular-nums; }
  .card { background:${C.card}; border:1px solid ${C.border}; border-radius:16px; padding:40px 48px; }
  .lead { font-size:34px; color:${C.ink2}; line-height:1.7; }
  ul.pts { list-style:none; display:flex; flex-direction:column; gap:30px; }
  ul.pts li { font-size:34px; line-height:1.6; color:${C.ink}; padding-left:44px; position:relative; }
  ul.pts li::before { content:""; position:absolute; left:8px; top:22px; width:12px; height:12px; border-radius:50%; background:${C.accent}; }
  ul.pts li .sub { display:block; font-size:27px; color:${C.ink2}; margin-top:6px; }
  .mono { font-family:Consolas,monospace; }
  .muted { color:${C.muted}; }
  .num { font-variant-numeric:tabular-nums; }
  table { border-collapse:collapse; width:100%; }
  th { font-size:26px; color:${C.muted}; font-weight:700; text-align:left; padding:14px 20px; border-bottom:2px solid ${C.grid}; }
  td { font-size:29px; padding:16px 20px; border-bottom:1px solid ${C.grid}; color:${C.ink}; }
  td.c, th.c { text-align:center; }
  .chip { display:inline-flex; align-items:center; gap:12px; }
  .chip .dot { width:16px; height:16px; border-radius:50%; flex:none; }
</style></head><body>
  <div class="kicker"><span class="kicker-bar"></span><span class="kicker-label">${kicker}</span></div>
  <div class="body">${body}</div>
  <div class="footer">
    <span class="footer-left">IndiviNEWS — 同一仕様・4モデル実装比較実験</span>
    <span class="footer-right">${num} / ${total}</span>
  </div>
</body></html>`;
}

function chip(model) {
  return `<span class="chip"><span class="dot" style="background:${model.color}"></span>${model.name}</span>`;
}

// 横棒チャート（1行=1モデル）。値ラベルはテキストインク、バーは薄め・右端のみ丸め。
function barChart(rows, { max, refValue, refLabel, format, trackW = 1150, labelW = 220, rowH = 76, barH = 34, fontPx = 30 }) {
  const gap = 28;
  const trackX = labelW + gap; // 参照線はコンテナ基準なのでラベル列ぶんオフセットする
  const ref =
    refValue != null
      ? `<div style="position:absolute; left:${trackX + (refValue / max) * trackW}px; top:26px; bottom:0; width:2px; background:${C.muted};"></div>
         <div style="position:absolute; left:${trackX + (refValue / max) * trackW + 14}px; top:-8px; font-size:24px; color:${C.muted};">${refLabel}</div>`
      : "";
  const bars = rows
    .map(
      (r) => `
    <div style="display:flex; align-items:center; gap:${gap}px; height:${rowH}px;">
      <div style="width:${labelW}px; font-size:${fontPx}px; text-align:right; flex:none;">${r.label}</div>
      <div style="position:relative; width:${trackW}px; flex:none; align-self:stretch; display:flex; align-items:center;">
        <div style="position:absolute; left:0; top:50%; width:${trackW}px; height:1px; background:${C.grid};"></div>
        <div style="position:relative; width:${Math.max((r.value / max) * trackW, 6)}px; height:${barH}px; background:${r.color}; border-radius:0 4px 4px 0;"></div>
      </div>
      <div class="num" style="font-size:${fontPx + 4}px; font-weight:700; color:${C.ink};">${format(r.value)}</div>
    </div>`,
    )
    .join("");
  return `<div style="position:relative; padding-top:40px;">${ref}${bars}</div>`;
}

// ---- slides ---------------------------------------------------------------
const slides = [];

// 1. タイトル
slides.push({
  kicker: "Tech Talk",
  body: `
  <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:48px;">
    <h1 style="font-size:88px;">AIの価格差は、<span class="em">スコアに出ない</span></h1>
    <p class="lead" style="font-size:40px;">同一仕様を4つのClaudeモデルに実装させて実測比較した</p>
    <p class="lead" style="font-size:30px;" >個人ニュースアプリ IndiviNEWS 開発の裏で行った実験の報告 ／ 2026-07</p>
  </div>`,
});

// 2. 背景と目的
slides.push({
  kicker: "背景と目的",
  body: `
  <h1 style="margin-bottom:56px;">「最上位モデルは価格差ぶん賢いのか？」を<br>定量で確かめたい</h1>
  <ul class="pts">
    <li>題材: 完全個人利用のニュースアプリ（iPhoneウィジェット＋毎朝の自動ダイジェスト）
      <span class="sub">Hacker News・はてなブックマーク・Zenn/Publickey を集約</span></li>
    <li>制約: <b>ランニングコスト0円</b>（Vercel／GitHub Actions無料枠のみ）</li>
    <li>好機: 最上位モデル Fable 5 がプラン内で使えるのは <b>7/7まで</b>
      <span class="sub">→ 期限までに「AIの力を測る」実験を仕込んだ</span></li>
  </ul>`,
});

// 3. 作ったもの
slides.push({
  kicker: "作ったもの",
  body: `
  <h1 style="margin-bottom:52px;">コスト0円で自走するニュース基盤</h1>
  <div style="display:flex; gap:36px; align-items:stretch; flex:1;">
    <div class="card" style="flex:1; display:flex; flex-direction:column; gap:22px;">
      <div style="font-size:26px; color:${C.muted}; letter-spacing:.1em;">ニュースソース</div>
      <div style="font-size:31px; line-height:1.9;">Hacker News API<br>はてなブックマーク RSS<br>Zenn / Publickey RSS</div>
      <div style="margin-top:auto; font-size:25px; color:${C.ink2};">認証不要・無料</div>
    </div>
    <div style="align-self:center; font-size:52px; color:${C.muted};">→</div>
    <div class="card" style="flex:1.35; display:flex; flex-direction:column; gap:26px;">
      <div style="font-size:26px; color:${C.muted}; letter-spacing:.1em;">処理（Node.js・LLM不使用）</div>
      <div style="font-size:31px; line-height:1.75;"><b>Vercel</b> サーバーレス関数<br><span style="color:${C.ink2}; font-size:27px;">ウィジェット用HTML／Edgeキャッシュ30分</span></div>
      <div style="font-size:31px; line-height:1.75;"><b>GitHub Actions</b> 毎朝06:00<br><span style="color:${C.ink2}; font-size:27px;">ダイジェストMarkdownを自動コミット</span></div>
    </div>
    <div style="align-self:center; font-size:52px; color:${C.muted};">→</div>
    <div class="card" style="flex:1; display:flex; flex-direction:column; gap:22px;">
      <div style="font-size:26px; color:${C.muted}; letter-spacing:.1em;">成果物</div>
      <div style="font-size:31px; line-height:1.9;">iPhoneホーム画面の<br>ニュースウィジェット<br><span style="color:${C.ink2};">＋ digests/*.md の蓄積</span></div>
      <div style="margin-top:auto; font-size:29px; color:${C.ink};">月額 <b style="font-size:40px;">0円</b></div>
    </div>
  </div>`,
});

// 4. 設計の転換
slides.push({
  kicker: "設計の転換",
  body: `
  <h1 style="margin-bottom:56px;">AIの使い所を「実行時」から「構築時」へ反転</h1>
  <div style="display:flex; gap:36px; flex:1;">
    <div class="card" style="flex:1;">
      <div style="font-size:27px; color:${C.muted}; margin-bottom:24px;">当初案</div>
      <div style="font-size:33px; line-height:1.8;">毎朝Claude APIで要約を生成<br><span style="color:${C.ink2}; font-size:29px;">→ APIはプランと別会計の従量課金。<br>「コスト0円」と根本矛盾</span></div>
    </div>
    <div style="align-self:center; font-size:52px; color:${C.accent};">→</div>
    <div class="card" style="flex:1; border-color:${C.accent};">
      <div style="font-size:27px; color:${C.muted}; margin-bottom:24px;">採用した設計</div>
      <div style="font-size:33px; line-height:1.8;">実行時のLLM呼び出しを<b>全廃</b>し<br>ルールベースで代替<br><span style="color:${C.ink2}; font-size:29px;">AIが働くのは設計・実装・検証の構築時のみ。成果物はAIなしで永続稼働</span></div>
    </div>
  </div>
  <p class="lead" style="margin-top:44px;">→ この「構築時のAI」の実力を測るのが今回の実験</p>`,
});

// 5. 実験設計
slides.push({
  kicker: "実験設計",
  body: `
  <h1 style="margin-bottom:52px;">同一仕様書を4モデルに、新規セッションで丸投げ</h1>
  <ul class="pts">
    <li>課題: <b>類似記事クラスタリング</b>の実装（仕様書は事前に固定・全モデル同一）</li>
    <li>採点: 正解ラベル付きデータ22件・231ペアを<b>実装開始前にコミットして固定</b>
      <span class="sub">pairwise F1で機械採点。実装セッションには正解データを見せない（覗いたら失格）</span></li>
    <li>計測: F1 ／ ターン数 ／ 介入回数 ／ 所要時間 ／ 自己検証の有無 ／ 潜在欠陥数</li>
    <li>公平性: 1プロンプト・質問には「任せます」のみ・ヒントなし・実行モード統一</li>
  </ul>
  <div class="card" style="margin-top:44px; padding:28px 40px;">
    <span style="font-size:29px; color:${C.ink2};">参考ベースライン: URL正規化だけの素朴な実装で <b class="num" style="color:${C.ink};">F1 = 0.800</b>（これを超えるにはタイトルの類似判定が必要）</span>
  </div>`,
});

// 6. 課題の難所
slides.push({
  kicker: "課題の難所",
  body: `
  <h1 style="margin-bottom:52px;">「同じ話題」をLLMなしで見抜けるか</h1>
  <div style="display:flex; flex-direction:column; gap:26px; flex:1;">
    <div class="card" style="padding:30px 44px;"><span style="font-size:31px;">URLの表記ゆれ … <span class="mono" style="font-size:27px; color:${C.ink2};">http/https・www・utm_source=…・末尾スラッシュ</span></span></div>
    <div class="card" style="padding:30px 44px;"><span style="font-size:31px;">タイトルの表記ゆれ … <span style="color:${C.ink2};">「【速報】ＯｐｅｎＡＩが…」と「OpenAI、…を発表」／「 - Qiita」等のサイト名</span></span></div>
    <div class="card" style="padding:30px 44px; border-color:${C.accent};">
      <div style="font-size:26px; color:${C.accent}; margin-bottom:12px; font-weight:700;">仕込んだ罠（hard negative）</div>
      <span style="font-size:31px;">「<b>Rust</b>でWebサーバーを自作する」×「<b>Go</b>でWebサーバーを自作する」<br><span style="color:${C.ink2}; font-size:28px;">— 語彙はほぼ同じ・話題は別。雑な類似判定はここで誤結合する</span></span>
    </div>
  </div>`,
});

// 7. 結果① スコア
slides.push({
  kicker: "結果 ①",
  body: `
  <h1 style="margin-bottom:36px;">F1スコア: <span class="em">4モデル中3モデルが同点</span></h1>
  ${barChart(
    [
      { label: "Fable 5", value: 0.8, color: C.fable },
      { label: "Opus 4.8", value: 0.8, color: C.opus },
      { label: "Sonnet 5", value: 0.727, color: C.sonnet },
      { label: "Haiku 4.5", value: 0.8, color: C.haiku },
    ],
    { max: 1.0, refValue: 0.8, refLabel: "ベースライン 0.800", format: (v) => v.toFixed(3) },
  )}
  <p class="lead" style="margin-top:40px;">最上位のFable 5も最安のHaiku 4.5も同じ0.800。しかも<b>誰もベースラインを超えられず</b>、
  Sonnet 5だけが罠（Rust/Go）を踏んでprecisionを落とした。<b>スコアだけ見れば価格差は見えない。</b></p>`,
});

// 8. 結果② スコア外
slides.push({
  kicker: "結果 ②",
  body: `
  <h1 style="margin-bottom:36px;">差は「スコア外」に出た</h1>
  <div style="display:flex; gap:64px; flex:1; min-width:0;">
    <div style="width:880px; flex:none;">
      <div style="font-size:27px; color:${C.muted}; margin-bottom:6px;">完走までに要した人間のターン数</div>
      ${barChart(
        [
          { label: "Fable 5", value: 1, color: C.fable },
          { label: "Opus 4.8", value: 1, color: C.opus },
          { label: "Sonnet 5", value: 1, color: C.sonnet },
          { label: "Haiku 4.5", value: 16, color: C.haiku },
        ],
        { max: 16, format: (v) => String(v), trackW: 560, labelW: 170, rowH: 72, barH: 30, fontPx: 28 },
      )}
    </div>
    <div style="flex:1; min-width:0;">
      <table>
        <tr><th>モデル</th><th class="c">自発的な自己検証</th><th class="c">潜在欠陥<span style="font-weight:400">（影響あり/なし）</span></th></tr>
        <tr><td>${chip(MODELS[0])}</td><td class="c">○ 単体12件</td><td class="c num">0 / 1</td></tr>
        <tr><td>${chip(MODELS[1])}</td><td class="c">○ 単体12件</td><td class="c num">0 / 1</td></tr>
        <tr><td>${chip(MODELS[2])}</td><td class="c">✗</td><td class="c num" style="color:${C.accent};">1 / 0</td></tr>
        <tr><td>${chip(MODELS[3])}</td><td class="c">✗</td><td class="c num" style="color:${C.accent};">2 / 2</td></tr>
      </table>
      <p style="font-size:27px; color:${C.ink2}; margin-top:28px; line-height:1.7;">検証習慣は上位2モデルのみ。潜在欠陥数はモデルランクと逆相関</p>
    </div>
  </div>`,
});

// 9. 深掘り
slides.push({
  kicker: "深掘り",
  body: `
  <h1 style="margin-bottom:52px;">同じ precision 1.000 でも、中身は別物</h1>
  <div style="display:flex; gap:36px; flex:1;">
    <div class="card" style="flex:1;">
      <div style="font-size:28px; margin-bottom:20px;">${chip(MODELS[0])}／${chip(MODELS[1])}</div>
      <div style="font-size:31px; line-height:1.75;">攻めた上で、防御機構で守った<br><span style="color:${C.ink2}; font-size:28px;">数字列の一致を前提条件に（Fable）、日英をまたがない言語ゲート（Opus）。設計として罠を回避</span></div>
    </div>
    <div class="card" style="flex:1;">
      <div style="font-size:28px; margin-bottom:20px;">${chip(MODELS[3])}</div>
      <div style="font-size:31px; line-height:1.75;">攻める能力がなく、結果的に安全<br><span style="color:${C.ink2}; font-size:28px;">単語分割ベースの類似度は日本語をほぼ1単語として扱い、あいまい一致が構造的に不可能。<b style="color:${C.ink};">“safe by incapacity”</b></span></div>
    </div>
  </div>
  <div class="card" style="margin-top:32px; padding:28px 44px;">
    <span style="font-size:29px;">${chip(MODELS[2])} のFPも閾値ミスではなく<b>構造的</b>: トークン粒度が言語で非対称（英語=単語、日本語=文字2-gram）で、FPとFNが同じ根から出ていた</span>
  </div>`,
});

// 10. 学び
slides.push({
  kicker: "学び",
  body: `
  <h1 style="margin-bottom:56px;">実験から持ち帰れる3つのこと</h1>
  <ul class="pts" style="gap:40px;">
    <li><b>自己採点は当てにならない</b>
      <span class="sub">上位2モデルは自作テスト12件全合格→それでも外部の正解データでは同じ2ペアを取りこぼした。評価は実装前に外部で固定する</span></li>
    <li><b>フロンティア2モデルは判断が収斂する</b>
      <span class="sub">FableとOpusは取りこぼしたペアまで完全一致。差は賢さでなくコード量（159行 vs 241行）と仕様読解の丁寧さに出る</span></li>
    <li><b>価格差の正体は、自走性・検証習慣・事故率</b>
      <span class="sub">最終スコアはほぼ同じでも、「1ターンで任せられるか」「勝手にテストを書くか」「地雷を埋めないか」が違う</span></li>
  </ul>`,
});

// 11. まとめ
slides.push({
  kicker: "まとめ",
  body: `
  <h1 style="margin-bottom:52px;">モデル選びは「正答率」でなく<br><span class="em">「事故率と手離れ」</span>で決める</h1>
  <ul class="pts">
    <li>使い捨てスクリプトや監視下の作業なら下位モデルで十分（スコアは同じ）</li>
    <li>無人で任せる・成果物が残る仕事は上位モデル（検証習慣と潜在欠陥数が違う）</li>
    <li>AIの評価をするなら、golden setを<b>実装前に固定</b>してから</li>
  </ul>
  <div class="card" style="margin-top:44px; padding:26px 40px; display:flex; gap:56px;">
    <span style="font-size:26px; color:${C.ink2};">制約: 各モデルn=1のケーススタディ／Haikuのみ実行モードが異なる／レビューはFable自身（バイアスの可能性）</span>
  </div>
  <p style="font-size:28px; color:${C.muted}; margin-top:30px;">仕様書・正解データ・採点スクリプト・4実装はすべてリポジトリに公開（experiment/ と exp/* ブランチ）</p>`,
});

// ---- emit -----------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
slides.forEach((s, i) => {
  const num = String(i + 1).padStart(2, "0");
  const html = shell({ ...s, num: i + 1, total: slides.length });
  fs.writeFileSync(path.join(OUT_DIR, `slide-${num}.html`), html);
});
console.log(`generated ${slides.length} slides in ${OUT_DIR}`);
