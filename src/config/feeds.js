// RSSフィード一覧・表示件数などの設定
// Vercelはサーバーレスのため、常駐プロセスによる定期取得は行わない。
// リクエスト時にライブ取得し、鮮度はapi/index.jsのCache-Control（s-maxage）で担保する。
module.exports = {
  // ウィジェットのスナップショット領域（上部）で見切れず収まる件数。
  // ページ自体には pageItems 件を流し込み、ウィジェットは上部だけを切り取るので
  // この値は「ウィジェットに見える件数の目安」であり、ページ全体の件数ではない。
  maxItems: 3,

  // ブラウザで開いたリッチ表示に流し込む総件数（ウィジェットは上部3件のみ表示）。
  pageItems: 18,

  // Hacker News: 取得する上位記事数
  hackerNews: {
    topStoriesCount: 15,
  },

  // はてなブックマーク人気エントリー（ITカテゴリ）
  hatena: {
    feedUrl: "https://b.hatena.ne.jp/hotentry/it.rss",
  },

  // 任意のRSSフィード（自由に追加・削除してよい）
  rssFeeds: [
    { name: "Zenn", url: "https://zenn.dev/feed" },
    { name: "Publickey", url: "https://www.publickey1.jp/atom.xml" },
  ],
};
