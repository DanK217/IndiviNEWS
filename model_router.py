"""
model_router.py — Fable 5 を 7/7 で自動的に手放すためのモデル選択層。

守りは3層:
  1) 日付ルーティング : 締切前だけ deep タスクに Fable、締切後は自動でフォールバック
  2) ハードガード     : 締切後に Fable を直接指定しても例外で弾く
  3) キルスイッチ     : 環境変数 FABLE_DISABLED=1 で即時に全停止

依存は標準ライブラリのみ（追加インストール不要）。
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CONFIG_PATH = Path(__file__).with_name("config.json")

_TRUTHY = {"1", "true", "yes", "on"}


class FableUnavailableError(RuntimeError):
    """締切後に Fable 5 が要求されたときに送出される（ハードガード）。"""


def load_config(path: Path = CONFIG_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def now_in_tz(config: dict | None = None) -> datetime:
    config = config or load_config()
    return datetime.now(ZoneInfo(config.get("timezone", "Asia/Tokyo")))


def fable_allowed(config: dict | None = None, now: datetime | None = None) -> bool:
    """Fable 5 を今使ってよいか。キルスイッチが最優先。"""
    config = config or load_config()

    # 3層目: 手動キルスイッチは常に最優先
    if os.getenv("FABLE_DISABLED", "").strip().lower() in _TRUTHY:
        return False

    # 1層目: 日付ルーティング
    now = now or now_in_tz(config)
    cutoff = datetime.fromisoformat(config["fable_cutoff"])
    return now < cutoff


def guard_model(model: str, config: dict | None = None, now: datetime | None = None) -> str:
    """2層目: 締切後に Fable が紛れ込んでいたら弾く。安全側に倒すための最終防壁。"""
    config = config or load_config()
    fable = config.get("fable_model", "claude-fable-5")
    if model == fable and not fable_allowed(config, now):
        raise FableUnavailableError(
            f"Fable 5 は締切（{config['fable_cutoff']}）以降は無効です。"
            "フォールバックモデルを使ってください。"
        )
    return model


def select_model(tier: str, config: dict | None = None, now: datetime | None = None) -> str:
    """tier に応じて使用モデルを返す。deep は締切をまたぐと自動でフォールバック。"""
    config = config or load_config()
    tiers = config["tiers"]
    if tier not in tiers:
        raise KeyError(f"未知の tier: {tier!r}（有効: {list(tiers)}）")

    spec = tiers[tier]
    if "model" in spec:
        model = spec["model"]
    else:
        model = (
            spec["model_until_cutoff"]
            if fable_allowed(config, now)
            else spec["model_after_cutoff"]
        )

    # 選ばれたモデルも必ずガードを通す
    return guard_model(model, config=config, now=now)


if __name__ == "__main__":
    cfg = load_config()
    now = now_in_tz(cfg)
    print(f"now           : {now.isoformat()}")
    print(f"cutoff        : {cfg['fable_cutoff']}")
    print(f"fable_allowed : {fable_allowed(cfg, now)}")
    for tier in cfg["tiers"]:
        print(f"  tier {tier:6} -> {select_model(tier, cfg, now)}")
