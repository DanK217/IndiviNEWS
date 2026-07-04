# 自走ニュースダイジェスト & Fable 5 自動手放し機構

7/8の締切までは Fable 5 を使い倒して自走の仕組みを作り、締切後は自動で
Opus 以下のモデルに切り替えて安定運用を続けるための仕組み。人間が毎回
気をつける必要はない。

## 何をするか

`runner.py` が Hacker News / はてなブックマーク人気エントリー / Zenn・Publickey
から見出しを取得し（`digest_fetchers.py`）、Claude にその中から面白い5件を
選んで短いダイジェストを書かせ、`digests/YYYY-MM-DD.md` として保存する。
GitHub Actions（`.github/workflows/news-digest.yml`）が毎朝これを実行し、
生成されたダイジェストをリポジトリへ自動コミットする。

## tier の自動判定（`default_tier`）

締切前は `deep`（Fableを最大限活用）、締切後は `daily`（安価モデルで安定運用）。
以前は「日曜日だけdeep」という曜日ベースの判定だったが、7/8までの短い期間に
Fableを使い倒すという目的に対して機会が少なすぎたため、`model_router` の
締切ロジックと連動する形に変更した。

## 守りは3層（`model_router.py`）

1. **日付ルーティング**（`config.json` + `select_model`）
   `deep` タスクは締切前だけ `claude-fable-5`、締切後は自動で `claude-opus-4-8` にフォールバック。`daily` は常に安価な `claude-sonnet-5`。
2. **ハードガード**（`guard_model`）
   どこかで誤って Fable を直接指定しても、締切後は `FableUnavailableError` で弾く。最終防壁。
3. **キルスイッチ**（環境変数 `FABLE_DISABLED=1`）
   締切前でも即座に全停止。手動で止めたいとき用。

## 締切の考え方

`fable_cutoff` は日本時間 **7/8 0:00**（`2026-07-08T00:00:00+09:00`）を既定にしています。JST は UTC/米国時間より先行するため、この時刻はAnthropicの「7/7まで」枠の内側に確実に収まり、うっかり従量課金に滑り込む事故を防ぎます。より慎重にしたい場合は `config.json` の `fable_cutoff` を 7/7 0:00 などに前倒しできます。

> ⚠️ **要確認**: 「Fable 5 が7/7まで無料」という前提は、このリポジトリの設定者が把握している情報に基づくものです。課金に関わる重要な前提なので、実際の請求ページ・利用規約で必ず事前にご確認ください。

## セットアップ

1. `pip install -r requirements.txt`
2. GitHubリポジトリの Settings → Secrets and variables → Actions で
   `ANTHROPIC_API_KEY` を登録する（未設定でもdry-runとしてニュース取得までは動く）

## 使い方

```bash
# 現在の判定を表示
python model_router.py

# 締切前後の挙動テスト（日付固定・決定的）
python test_router.py

# エージェント本体（tier未指定なら締切ベースで自動判定）
python runner.py
python runner.py --tier deep
```

GitHub Actionsでは毎朝06:00 JSTに自動実行され、`digests/`配下にダイジェストが
コミットされる。`workflow_dispatch`から手動実行して`tier`を明示的に指定することもできる。

## tier とモデルの対応（`config.json` で変更可）

| tier  | 締切前         | 締切後         |
|-------|----------------|----------------|
| daily | claude-sonnet-5 | claude-sonnet-5 |
| deep  | claude-fable-5  | claude-opus-4-8 |
