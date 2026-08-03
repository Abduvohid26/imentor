from __future__ import annotations

from typing import Any

from fastapi import Request


def _parse_positive_int(value: str | None, default: int) -> int:
    try:
        parsed = int(value) if value else default
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def paginate(
    items: list[Any],
    request: Request,
    *,
    default_page_size: int = 50,
    max_page_size: int = 200,
) -> dict[str, Any]:
    """Django `paginate_items` bilan bir xil javob shakli: {count, page, page_size, results}."""
    page = _parse_positive_int(request.query_params.get("page"), 1)
    page_size = _parse_positive_int(request.query_params.get("page_size"), default_page_size)
    page_size = min(page_size, max_page_size)

    total = len(items)
    start = (page - 1) * page_size
    page_items = items[start : start + page_size]

    return {"count": total, "page": page, "page_size": page_size, "results": page_items}
