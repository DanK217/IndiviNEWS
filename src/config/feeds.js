// RSSフィード一覧・表示件数などの設定
// Vercelはサーバーレスのため、常駐プロセスによる定期取得は行わない。
// リクエスト時にライブ取得し、鮮度はapi/index.jsのCache-Control（s-maxage）で担保する。
module.exports = {
  // 全ソース合算後にリストへ表示する件数
  maxItems: 8,

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
