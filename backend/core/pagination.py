"""Oddiy sahifalash — DRF PageNumberPagination o'rniga yengil yordamchi."""

from __future__ import annotations

from typing import Any, Iterable, TypeVar

from rest_framework.request import Request
from rest_framework.response import Response

T = TypeVar("T")


def _parse_positive_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


from django.db.models.query import QuerySet


def paginate_items(
    items: Iterable[T] | Any,
    request: Request,
    *,
    default_page_size: int = 50,
    max_page_size: int = 200,
) -> dict[str, Any]:
    page = _parse_positive_int(request.query_params.get("page"), 1)
    page_size = _parse_positive_int(request.query_params.get("page_size"), default_page_size)
    page_size = min(page_size, max_page_size)

    if isinstance(items, QuerySet):
        total = int(items.count())
        start = (page - 1) * page_size
        page_items = list(items[start : start + page_size])
    else:
        seq = list(items)
        total = len(seq)
        start = (page - 1) * page_size
        page_items = seq[start : start + page_size]

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "results": page_items,
    }


def paginated_response(
    items: Iterable[T] | Any,
    request: Request,
    *,
    default_page_size: int = 50,
    max_page_size: int = 200,
    mapper: Any | None = None,
) -> Response:
    payload = paginate_items(
        items,
        request,
        default_page_size=default_page_size,
        max_page_size=max_page_size,
    )
    if mapper is not None:
        payload["results"] = [mapper(item) for item in payload["results"]]
    return Response(payload)
