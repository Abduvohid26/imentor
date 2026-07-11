"""Haversine distance on WGS84 sphere (approximate)."""

from __future__ import annotations

import math


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))
    return r * c


def point_in_polygon(lat: float, lon: float, ring: list[tuple[float, float]]) -> bool:
    """Ray-casting: nuqta yopiq koordinata halqasi ichidami."""
    if len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi
        ):
            inside = not inside
        j = i
    return inside


def normalize_boundary(raw) -> list[tuple[float, float]]:
    """JSON boundary -> [(lat, lng), ...]"""
    if not isinstance(raw, list):
        return []
    out: list[tuple[float, float]] = []
    for pt in raw:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        try:
            lat, lng = float(pt[0]), float(pt[1])
        except (TypeError, ValueError):
            continue
        if abs(lat) <= 90 and abs(lng) <= 180:
            out.append((lat, lng))
    return out
