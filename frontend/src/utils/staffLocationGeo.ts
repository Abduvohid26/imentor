import { postStaffLocationPing } from './staffLocationApi';

/** Hodim joylashuvi yangilanganda (xarita va UI uchun) */
export const STAFF_GEO_UPDATE_EVENT = 'app:staff-geo-update';

/** Jonli xaritada «eski» ping (ms). */
export const STALE_PING_MS = 20 * 60 * 1000;

/** Klient yubormaydigan juda yomon GPS (metr). */
export const MAX_CLIENT_ACCURACY_M = 200;

export function isPingStale(recordedAt: string | number | Date, nowMs = Date.now()): boolean {
  const t = new Date(recordedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > STALE_PING_MS;
}

export type LatLngTuple = [number, number];

export type StaffGeoDetail = {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recordedAt: number;
};

export function dispatchStaffGeoUpdate(detail: StaffGeoDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STAFF_GEO_UPDATE_EVENT, { detail }));
}

/** WGS84 — masofa metrlarda (backend haversine bilan mos). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export type NearestBuildingMatch = {
  building: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    radius_m: number;
    boundary?: LatLngTuple[];
  };
  distance_m: number;
  inside: boolean;
};

export type BuildingGeoInput = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  boundary?: LatLngTuple[] | null;
  is_active?: boolean;
};

/** Ray-casting: nuqta koordinata halqasi ichidami. */
export function pointInPolygon(lat: number, lng: number, ring: LatLngTuple[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function normalizeBoundary(raw: unknown): LatLngTuple[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLngTuple[] = [];
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
  }
  return out;
}

/** Markaz atrofida taxminiy to'rtburchak chegara (metr). */
export function defaultRectBoundary(
  lat: number,
  lng: number,
  halfWidthM = 45,
  halfHeightM = 35,
): LatLngTuple[] {
  const dLat = halfHeightM / 111_320;
  const dLng = halfWidthM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lat + dLat, lng - dLng],
    [lat + dLat, lng + dLng],
    [lat - dLat, lng + dLng],
    [lat - dLat, lng - dLng],
  ];
}

export function buildingContainsPoint(lat: number, lng: number, b: BuildingGeoInput): boolean {
  return haversineMeters(lat, lng, b.latitude, b.longitude) <= b.radius_m;
}

/** Hodim qaysi bino hududida (polygon ustunlik, keyin radius). */
export function matchStaffBuilding(
  lat: number,
  lng: number,
  buildings: BuildingGeoInput[],
): NearestBuildingMatch | null {
  const active = buildings.filter((b) => b.is_active !== false);
  const insideList = active.filter((b) => buildingContainsPoint(lat, lng, b));
  if (insideList.length === 1) {
    const b = insideList[0];
    return {
      building: { ...b, boundary: normalizeBoundary(b.boundary) },
      distance_m: haversineMeters(lat, lng, b.latitude, b.longitude),
      inside: true,
    };
  }
  if (insideList.length > 1) {
    const b = insideList.reduce((best, cur) => {
      const dBest = haversineMeters(lat, lng, best.latitude, best.longitude);
      const dCur = haversineMeters(lat, lng, cur.latitude, cur.longitude);
      return dCur < dBest ? cur : best;
    });
    return {
      building: { ...b, boundary: normalizeBoundary(b.boundary) },
      distance_m: haversineMeters(lat, lng, b.latitude, b.longitude),
      inside: true,
    };
  }

  let best: NearestBuildingMatch | null = null;
  for (const b of active) {
    const distance_m = haversineMeters(lat, lng, b.latitude, b.longitude);
    if (!best || distance_m < best.distance_m) {
      best = {
        building: { ...b, boundary: normalizeBoundary(b.boundary) },
        distance_m,
        inside: false,
      };
    }
  }
  return best;
}

/**
 * Foydalanuvchi bosishi bilan chaqiring — iOS Safari va baʼzi Android brauzerlarida
 * geolocation dialog faqat user gesture dan keyin chiqishi uchun.
 */
export function requestOneShotStaffLocationPing(): Promise<StaffGeoDetail> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation-unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const now = Date.now();
        const accuracy_m = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
        try {
          await postStaffLocationPing({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m,
            client_ts_ms: now,
          });
        } catch {
          /* tarmoq — baribir pozitsiyani UI ga beramiz */
        }
        const detail: StaffGeoDetail = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m,
          recordedAt: now,
        };
        dispatchStaffGeoUpdate(detail);
        resolve(detail);
      },
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 28_000,
      },
    );
  });
}

export function subscribeStaffGeoUpdate(listener: (detail: StaffGeoDetail) => void): () => void {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<StaffGeoDetail>;
    if (ce.detail) listener(ce.detail);
  };
  window.addEventListener(STAFF_GEO_UPDATE_EVENT, handler);
  return () => window.removeEventListener(STAFF_GEO_UPDATE_EVENT, handler);
}
