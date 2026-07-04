"""
digest_fetchers.py — 自走ニュースエージェント用のニュース取得（Python版）。

Widgetsmith表示用サイト（src/fetchers/*.js）と同じ3ソース（Hacker News /
はてなブックマーク人気エントリー / Zenn・Publickey）を、Node側とは独立に
Pythonだけで再取得する（このワークフローはPythonのみをセットアップするため）。

各ソースにつき最新15件までに絞って取得する。ソース間で偏らせず、
Claudeへの要約プロンプトにはソースを区別したまま渡す
（単純に日時でマージ・切り詰めるとHacker Newsの更新頻度の高さに
他ソースが埋もれてしまうため — Widgetsmith側で踏んだのと同じ問題）。
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import requests

REQUEST_TIMEOUT = 10
PER_SOURCE_LIMIT = 15

HN_TOP_STORIES_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"

HATENA_FEED_URL = "https://b.hatena.ne.jp/hotentry/it.rss"

RSS_FEEDS = [
    ("Zenn", "https://zenn.dev/feed"),
    ("Publickey", "https://www.publickey1.jp/atom.xml"),
]

_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _parse_rfc822(value: str | None) -> datetime:
    if not value:
        return _EPOCH
    try:
        return parsedate_to_datetime(value)
    except (ValueError, TypeError):
        return _EPOCH


def _parse_iso(value: str | None) -> datetime:
    if not value:
        return _EPOCH
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return _EPOCH


def fetch_hacker_news() -> list[dict]:
    res = requests.get(HN_TOP_STORIES_URL, timeout=REQUEST_TIMEOUT)
    res.raise_for_status()
    top_ids = res.json()[:PER_SOURCE_LIMIT]

    items = []
    for item_id in top_ids:
        try:
            r = requests.get(HN_ITEM_URL.format(item_id), timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            data = r.json()
        except requests.RequestException:
            continue
        if not data or not data.get("title") or not data.get("url"):
            continue
        published = (
            datetime.fromtimestamp(data["time"], tz=timezone.utc)
            if data.get("time")
            else _EPOCH
        )
        items.append(
            {
                "source": "Hacker News",
                "title": data["title"],
                "url": data["url"],
                "published_at": published,
            }
        )
    return items


def _parse_feed(source_name: str, xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)

    # RSS 2.0: <rss><channel><item>...
    channel = root.find("channel")
    if channel is not None:
        items = []
        for entry in channel.findall("item"):
            title = entry.findtext("title")
            link = entry.findtext("link")
            if not title or not link:
                continue
            items.append(
                {
                    "source": source_name,
                    "title": title.strip(),
                    "url": link.strip(),
                    "published_at": _parse_rfc822(entry.findtext("pubDate")),
                }
            )
        return items

    # Atom: <feed><entry>...
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    items = []
    for entry in root.findall("atom:entry", ns):
        title = entry.findtext("atom:title", namespaces=ns)
        link_el = entry.find("atom:link", ns)
        link = link_el.get("href") if link_el is not None else None
        if not title or not link:
            continue
        updated = entry.findtext("atom:updated", namespaces=ns) or entry.findtext(
            "atom:published", namespaces=ns
        )
        items.append(
            {
                "source": source_name,
                "title": title.strip(),
                "url": link.strip(),
                "published_at": _parse_iso(updated),
            }
        )
    return items


def _fetch_feed(source_name: str, url: str) -> list[dict]:
    res = requests.get(url, timeout=REQUEST_TIMEOUT)
    res.raise_for_status()
    items = _parse_feed(source_name, res.text)
    items.sort(key=lambda x: x["published_at"], reverse=True)
    return items[:PER_SOURCE_LIMIT]


def fetch_hatena() -> list[dict]:
    return _fetch_feed("はてなブックマーク", HATENA_FEED_URL)


def fetch_rss_feeds() -> list[dict]:
    items = []
    for name, url in RSS_FEEDS:
        try:
            items.extend(_fetch_feed(name, url))
        except (requests.RequestException, ET.ParseError):
            continue
    return items


def fetch_all_news() -> list[dict]:
    """3ソースを取得して1つのリストに（ソース情報を保持したまま）まとめて返す。
    失敗したソースがあっても他のソースだけで継続する。
    """
    all_items: list[dict] = []
    for fetcher in (fetch_hacker_news, fetch_hatena, fetch_rss_feeds):
        try:
            all_items.extend(fetcher())
        except requests.RequestException:
            continue
    return all_items


if __name__ == "__main__":
    news = fetch_all_news()
    print(f"取得件数: {len(news)}")
    for entry in news[:5]:
        print(f"  [{entry['source']}] {entry['title']}")
