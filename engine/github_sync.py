"""Headless compatibility layer.

The original Streamlit build persisted snapshots through Streamlit secrets.
SStateMarketTerminal uses Cloudflare R2 as the runtime source of truth, so the
engine only needs deterministic JSON serialization and local previous-snapshot
fallback. GitHub sync is intentionally disabled here.
"""
from __future__ import annotations
import json
from typing import Any

SNAPSHOT_JSON_FORMAT = "pretty-indent-2-v2"


def serialize_snapshot_json(snapshot: dict[str, Any]) -> str:
    batch = snapshot.setdefault("batch", {})
    batch["json_format"] = SNAPSHOT_JSON_FORMAT
    text = json.dumps(snapshot, ensure_ascii=False, indent=2)
    for key in (
        "state_action", "state_action_zh", "ai_state_dashboard",
        "chart_semantics", "breadth", "groups", "records",
    ):
        text = text.replace(f'\n  "{key}":', f'\n\n  "{key}":', 1)
    return text + "\n"


def load_snapshot_from_github(path_override: str | None = None):
    return None


def sync_snapshot_to_github(snapshot: dict[str, Any], path_override: str | None = None):
    return "disabled", "Runtime snapshot persistence is handled by Cloudflare R2."
