from __future__ import annotations

import json
import re
import time
from typing import Any, Iterator

import requests

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS = 1536


class OpenAiClientError(Exception):
    """Model javobi yoki HTTP xatosi."""


def _parse_retry_after_seconds(message: str) -> float:
    m = re.search(r"[Rr]etry[- ]after[:\s]+(\d+)", message)
    if m:
        return min(120.0, max(3.0, float(m.group(1)) + 1.0))
    return 55.0


def _is_rate_limited(message: str) -> bool:
    return bool(re.search(r"\b429\b|rate.?limit|overloaded", message, re.I))


def _is_transient_error(message: str) -> bool:
    return _is_rate_limited(message) or bool(re.search(r"\bHTTP 5\d\d\b", message))


def _http_post(api_key: str, payload: dict[str, Any], *, url: str, timeout_sec: int = 180) -> dict[str, Any]:
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_sec,
        )
    except requests.RequestException as e:
        raise OpenAiClientError(str(e)) from e
    if resp.status_code >= 400:
        try:
            msg = str((resp.json().get("error") or {}).get("message") or resp.text)
        except ValueError:
            msg = resp.text
        raise OpenAiClientError(f"HTTP {resp.status_code}: {msg}")
    return resp.json() if resp.content else {}


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


def generate_openai_chat(
    api_key: str,
    *,
    messages: list[dict],
    model: str = "gpt-4o",
    max_tokens: int = 4096,
    temperature: float = 0.35,
    timeout_sec: int = 280,
    response_format: dict | None = None,
) -> str:
    """Tayyor `messages` ro'yxati (system/user/assistant) bilan chat completion."""
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if response_format:
        body["response_format"] = response_format
    resp = _http_post(api_key, body, url=OPENAI_CHAT_URL, timeout_sec=timeout_sec)
    return _extract_text(resp)


def stream_openai_chat(
    api_key: str,
    *,
    messages: list[dict],
    model: str = "gpt-4o",
    max_tokens: int = 4096,
    temperature: float = 0.35,
    timeout_sec: int = 280,
) -> Iterator[str]:
    """OpenAI chat completion'ni SSE orqali oqim (stream) sifatida o'qib,
    har bir matn bo'lagini (`delta.content`) navbat bilan qaytaradi.
    Foydalanuvchi generatsiya jarayonida darhol matnni ko'rib turishi uchun —
    umumiy vaqt bir xil, lekin sezilgan tezlik ancha yaxshilanadi."""
    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    try:
        resp = requests.post(
            OPENAI_CHAT_URL,
            json=body,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_sec,
            stream=True,
        )
    except requests.RequestException as e:
        raise OpenAiClientError(str(e)) from e

    if resp.status_code >= 400:
        try:
            msg = str((resp.json().get("error") or {}).get("message") or resp.text)
        except ValueError:
            msg = resp.text
        raise OpenAiClientError(f"HTTP {resp.status_code}: {msg}")

    for raw_line in resp.iter_lines(decode_unicode=True):
        if not raw_line or not raw_line.startswith("data:"):
            continue
        data = raw_line[len("data:") :].strip()
        if data == "[DONE]":
            break
        try:
            chunk = json.loads(data)
        except ValueError:
            continue
        choices = chunk.get("choices")
        if not isinstance(choices, list) or not choices:
            continue
        delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
        text = delta.get("content") if isinstance(delta, dict) else None
        if text:
            yield text


def generate_openai_text(
    api_key: str,
    *,
    user_text: str,
    system_instruction: str | None = None,
    model: str = "gpt-4o",
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

    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }

    last_err: str | None = None
    for attempt in range(max(1, max_429_retries)):
        try:
            resp = _http_post(api_key, body, url=OPENAI_CHAT_URL, timeout_sec=timeout_sec)
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
                if _is_transient_error(msg) and attempt + 1 < max_429_retries:
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
