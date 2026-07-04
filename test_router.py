"""
test_router.py — 締切前後の挙動を、日付を固定して確認する。
実行: python test_router.py
"""
from datetime import datetime
from zoneinfo import ZoneInfo

import model_router as mr

JST = ZoneInfo("Asia/Tokyo")
cfg = mr.load_config()

before = datetime(2026, 7, 7, 12, 0, tzinfo=JST)  # 無料枠の内側
after = datetime(2026, 7, 8, 0, 1, tzinfo=JST)    # 締切後

# daily は常に安価モデル
assert mr.select_model("daily", cfg, before) == "claude-sonnet-5"
assert mr.select_model("daily", cfg, after) == "claude-sonnet-5"

# deep は締切前だけ Fable、締切後は Opus にフォールバック
assert mr.select_model("deep", cfg, before) == "claude-fable-5"
assert mr.select_model("deep", cfg, after) == "claude-opus-4-8"

# 判定関数そのもの
assert mr.fable_allowed(cfg, before) is True
assert mr.fable_allowed(cfg, after) is False

# ハードガード: 締切後に Fable を直接渡しても弾かれる
try:
    mr.guard_model("claude-fable-5", cfg, after)
    raise SystemExit("NG: 締切後に Fable がすり抜けました")
except mr.FableUnavailableError:
    pass

# 締切前はガードを通過する
assert mr.guard_model("claude-fable-5", cfg, before) == "claude-fable-5"

print("all routing tests passed")
