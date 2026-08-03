from __future__ import annotations

from typing import Any

_MAX_MESSAGES = 32
_MAX_MESSAGE_CHARS = 120_000


def clip_education_messages(messages: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in messages[:_MAX_MESSAGES]:
        if not isinstance(raw, dict):
            continue
        role = str(raw.get("role") or "").strip().lower()
        if role not in ("system", "user", "assistant"):
            continue
        content = raw.get("content")
        if isinstance(content, str):
            content = content[:_MAX_MESSAGE_CHARS]
        elif isinstance(content, list):
            clipped: list[Any] = []
            for part in content[:24]:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text" and isinstance(part.get("text"), str):
                    clipped.append({"type": "text", "text": part["text"][:_MAX_MESSAGE_CHARS]})
                elif part.get("type") == "image_url":
                    img = part.get("image_url")
                    if isinstance(img, dict) and isinstance(img.get("url"), str):
                        url = img["url"]
                        if url.startswith("data:image/") and len(url) <= 6_000_000:
                            clipped.append(part)
            content = clipped
        else:
            continue
        out.append({"role": role, "content": content})
    return out
