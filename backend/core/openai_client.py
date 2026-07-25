"""
Server-side OpenAI Chat Completions API. Kalit faqat server muhitida.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
OPENAI_CHAT = "gpt-4o"
OPENAI_FAST = "gpt-4o-mini"
OPENAI_REASONER = "gpt-4o"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS = 1536

_MODEL_ALIASES = {
    "deepseek-chat": OPENAI_CHAT,
    "deepseek-reasoner": OPENAI_REASONER,
    "gpt-4o": OPENAI_CHAT,
    "gpt-4o-mini": OPENAI_FAST,
}


class OpenAiClientError(Exception):
    """Model javobi yoki HTTP xatosi."""


# Eski importlar bilan moslik
DeepseekClientError = OpenAiClientError
GeminiClientError = OpenAiClientError
AnthropicClientError = OpenAiClientError


def resolve_openai_model(model: str | None) -> str:
    raw = (model or "").strip()
    if not raw:
        return getattr(settings, "OPENAI_CHAT_MODEL", OPENAI_CHAT)
    return _MODEL_ALIASES.get(raw, raw)


def _parse_retry_after_seconds(message: str) -> float:
    m = re.search(r"[Rr]etry[- ]after[:\s]+(\d+)", message)
    if m:
        return min(120.0, max(3.0, float(m.group(1)) + 1.0))
    return 55.0


def _is_rate_limited(message: str) -> bool:
    return bool(re.search(r"\b429\b|rate.?limit|overloaded", message, re.I))


def _http_post(
    api_key: str,
    payload: dict[str, Any],
    *,
    url: str = OPENAI_CHAT_URL,
    timeout_sec: int = 180,
) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err_obj = json.loads(body)
            msg = str((err_obj.get("error") or {}).get("message") or body)
        except json.JSONDecodeError:
            msg = body or str(e)
        raise OpenAiClientError(f"HTTP {e.code}: {msg}") from e


def _extract_text(resp: dict[str, Any]) -> str:
    choices = resp.get("choices")
    if not isinstance(choices, list) or not choices:
        raise OpenAiClientError("No choices in OpenAI response")
    msg = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(msg, dict):
        raise OpenAiClientError("No message in OpenAI response")
    content = msg.get("content")
    if not isinstance(content, str) or not content.strip():
        raise OpenAiClientError("Empty model text")
    return content.strip()


def generate_openai_text(
    api_key: str,
    *,
    user_text: str,
    system_instruction: str | None = None,
    model: str | None = None,
    max_tokens: int = 8192,
    temperature: float = 0.35,
    json_only: bool = False,
    max_429_retries: int = 2,
    timeout_sec: int = 180,
) -> str:
    sys_text = (system_instruction or "").strip()
    if json_only:
        suffix = "\n\nReturn ONLY valid JSON (no markdown fences, no extra text)."
        sys_text = (sys_text + suffix).strip() if sys_text else suffix.strip()

    messages: list[dict[str, str]] = []
    if sys_text:
        messages.append({"role": "system", "content": sys_text})
    messages.append({"role": "user", "content": user_text})

    body: dict[str, Any] = {
        "model": resolve_openai_model(model),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    last_err: str | None = None
    for attempt in range(max(1, max_429_retries)):
        try:
            resp = _http_post(api_key, body, timeout_sec=timeout_sec)
            return _extract_text(resp)
        except OpenAiClientError as e:
            msg = str(e)
            last_err = msg
            if _is_rate_limited(msg) and attempt + 1 < max_429_retries:
                time.sleep(_parse_retry_after_seconds(msg))
                continue
            raise

    raise OpenAiClientError(last_err or "Unknown OpenAI error")


def create_embeddings(
    api_key: str,
    texts: list[str],
    *,
    model: str = OPENAI_EMBEDDING_MODEL,
    batch_size: int = 96,
    timeout_sec: int = 120,
    max_429_retries: int = 6,
) -> list[list[float]]:
    """Matnlar ro'yxati uchun embedding vektorlarini hisoblaydi (batch bo'yicha, 429'da retry)."""
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp: dict[str, Any] | None = None
        for attempt in range(max(1, max_429_retries)):
            try:
                resp = _http_post(
                    api_key,
                    {"model": model, "input": batch},
                    url=OPENAI_EMBEDDINGS_URL,
                    timeout_sec=timeout_sec,
                )
                break
            except OpenAiClientError as e:
                msg = str(e)
                if _is_rate_limited(msg) and attempt + 1 < max_429_retries:
                    time.sleep(_parse_retry_after_seconds(msg))
                    continue
                raise
        assert resp is not None
        data = resp.get("data")
        if not isinstance(data, list) or len(data) != len(batch):
            raise OpenAiClientError("Embedding javobi noto'g'ri formatda")
        ordered = sorted(data, key=lambda item: item.get("index", 0))
        for item in ordered:
            embedding = item.get("embedding")
            if not isinstance(embedding, list):
                raise OpenAiClientError("Embedding qiymati topilmadi")
            out.append(embedding)
    return out


# Eski nomlar (import mosligi)
generate_deepseek_text = generate_openai_text
generate_claude_text = generate_openai_text
generate_content_with_model_fallback = generate_openai_text
DEEPSEEK_CHAT = OPENAI_CHAT
DEEPSEEK_REASONER = OPENAI_REASONER
