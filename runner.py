"""
runner.py — 自走ニュースエージェントのエントリポイント。

- tier未指定なら「Fable 5が使える締切前かどうか」で自動判定する
  （締切前 = deep / Fableを最大限活用、締切後 = daily / 安価モデルで安定運用）。
  以前は曜日（日曜だけdeep）で判定していたが、7/8の締切までの間にFableを
  使い倒して自走の仕組みを作るという目的に対して機会が少なすぎたため、
  model_router側の締切ロジックとそろえる形に変更した。
- model_router経由でモデルを選ぶので、7/7の締切は自動で効く。
- ANTHROPIC_API_KEYが無ければニュース取得のみ行いdry-runで動作確認できる。
- 生成したダイジェストは digests/YYYY-MM-DD.md に保存する
  （ワークフロー側でリポジトリにコミットする）。
"""
import argparse
import os
from pathlib import Path

import model_router as mr
import digest_fetchers as fetchers

DIGEST_DIR = Path(__file__).with_name("digests")

PROMPT_TEMPLATE = """あなたは技術ニュースのキュレーターです。以下は本日収集した技術ニュースの見出し一覧です
（Hacker News / はてなブックマーク人気エントリー / Zenn・Publickey の3ソース）。

この中からエンジニア向けに特に面白い・重要だと思うものを5件選び、次のフォーマットの
Markdownのみを出力してください（前置き・後書きの文章は不要）。

## 見出し一覧
{headlines}

## 出力フォーマット（この形式のみを出力すること）
- **[タイトル（日本語に要約・意訳してよい）](URL)** — 1行程度のコメント（なぜ面白いか）
"""


def default_tier(now=None) -> str:
    """締切前ならdeep（Fable活用）、締切後はdaily（安価モデルで安定運用）。"""
    return "deep" if mr.fable_allowed(now=now) else "daily"


def format_headlines(items: list[dict]) -> str:
    return "\n".join(f"- ({item['source']}) {item['title']} — {item['url']}" for item in items)


def build_digest(model: str, tier: str) -> str:
    items = fetchers.fetch_all_news()
    if not items:
        return "（ニュース取得に失敗しました。全ソースが失敗しています。）"

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return (
            f"[dry-run] tier={tier} / model={model}\n"
            f"取得件数: {len(items)}件（ANTHROPIC_API_KEY未設定のためClaude要約はスキップ）"
        )

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    prompt = PROMPT_TEMPLATE.format(headlines=format_headlines(items))
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    if response.stop_reason == "refusal":
        return "（Claudeが安全上の理由でこの要約を辞退しました。）"

    text = "".join(block.text for block in response.content if block.type == "text")
    return text.strip()


def save_digest(content: str, tier: str, model: str) -> Path:
    DIGEST_DIR.mkdir(exist_ok=True)
    today = mr.now_in_tz().strftime("%Y-%m-%d")
    path = DIGEST_DIR / f"{today}.md"
    header = f"# {today} のテックニュースダイジェスト\n\n_tier: {tier} / model: {model}_\n\n"
    path.write_text(header + content + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tier",
        choices=["daily", "deep"],
        default=None,
        help="未指定なら締切ベースで自動判定（締切前=deep, 締切後=daily）",
    )
    args = parser.parse_args()

    tier = args.tier or default_tier()
    model = mr.select_model(tier)  # ここで締切ロジックが自動適用される
    print(f"tier={tier}  model={model}")

    digest = build_digest(model, tier)
    print(digest)

    path = save_digest(digest, tier, model)
    print(f"saved: {path}")


if __name__ == "__main__":
    main()
