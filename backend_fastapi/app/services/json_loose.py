from __future__ import annotations

import json
import re
from typing import Any


def parse_json_loose(text: str) -> Any:
    if not text or not str(text).strip():
        raise ValueError("Empty response from AI")
    json_string = str(text).strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", json_string)
    if m:
        json_string = m.group(1).strip()
    try:
        return json.loads(json_string)
    except json.JSONDecodeError:
        obj_start = json_string.find("{")
        arr_start = json_string.find("[")
        if obj_start == -1:
            start = arr_start
        elif arr_start == -1:
            start = obj_start
        else:
            start = min(obj_start, arr_start)
        obj_end = json_string.rfind("}")
        arr_end = json_string.rfind("]")
        end = max(obj_end, arr_end)
        if start == -1 or end == -1 or end < start:
            raise
        return json.loads(json_string[start : end + 1])
