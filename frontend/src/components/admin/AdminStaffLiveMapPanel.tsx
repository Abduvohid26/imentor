import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LeafletAttributionStrip } from '../map/LeafletAttributionStrip';
import { matchStaffBuilding, isPingStale } from '../../utils/staffLocationGeo';
import { useUiText } from '../../i18n/useUiText';
import type { UiTextKey } from '../../i18n/translations';
import './AdminStaffLiveMapPanel.css';
import type { CampusBuildingDto, StaffLocationPingDto } from '../../utils/staffLocationApi';
import type { StaffDirectoryEntry } from '../../utils/staffDirectoryApi';

/** Fargʻona viloyati — kampus binolari markazi */
const DEFAULT_CENTER: [number, number] = [40.386, 71.786];

const PERSON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="white" d="M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
  <path fill="white" d="M4 20.5v-1.2c0-2.8 4.2-4.3 8-4.3s8 1.5 8 4.3v1.2H4z"/>
</svg>
`.trim();

type TranslateFn = (key: UiTextKey, params?: Record<string, string | number>) => string;

function latestPingByOwner(pings: StaffLocationPingDto[]): StaffLocationPingDto[] {
  const m = new Map<string, StaffLocationPingDto>();
  for (const p of pings) {
    const prev = m.get(p.owner_key);
    if (!prev || new Date(p.recorded_at).getTime() > new Date(prev.recorded_at).getTime()) {
      m.set(p.owner_key, p);
    }
  }
  return Array.from(m.values());
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)
  );
}

function hueForOwner(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 72% 42%)`;
}

function formatAge(recordedAt: string, t: TranslateFn, locale: string): string {
  const diff = Date.now() - new Date(recordedAt).getTime();
  if (diff < 60_000) return t('admin.mapPopup.justNow');
  if (diff < 3600_000) return t('admin.mapPopup.minutesAgo', { minutes: Math.floor(diff / 60_000) });
  return new Date(recordedAt).toLocaleString(locale);
}

function findStaffProfile(ownerKey: string, directory: StaffDirectoryEntry[]): StaffDirectoryEntry | undefined {
  return directory.find((u) => u.phone_digits === ownerKey);
}

function initialsFromProfile(u: StaffDirectoryEntry | undefined, fallbackKey: string): string {
  if (u) {
    const a = (u.first_name || '').trim().charAt(0);
    const b = (u.last_name || '').trim().charAt(0);
    if (a || b) return (a + b).toUpperCase();
    const n = (u.display_name || '').trim();
    if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  }
  return fallbackKey.slice(-2);
}

/** Hodim pini: 40×50 px, uchidan (pastki markaz) GPS nuqtasiga birikadi */
const STAFF_PIN_W = 40;
const STAFF_PIN_H = 50;

function buildStaffPinHtml(accentColor: string, stale = false): string {
  const fade = stale ? 'opacity:0.45;filter:grayscale(0.35);' : '';
  return `
<div class="staff-pin-wrap" style="${fade}">
  <div class="staff-pin-head" style="background:${accentColor};">
    ${PERSON_SVG}
  </div>
  <div class="staff-pin-tail" style="border-top-color:${accentColor};"></div>
</div>`.trim();
}

/**
 * Xarita ko‘rinishini faqat filtr o‘zgarganda moslaydi.
 * GPS yangilanishida (har 5 s) zoom/pan qayta o‘rnatilmaydi — marker siljib ketmaydi.
 */
function MapViewportController({
  points,
  viewportKey,
}: {
  points: [number, number][];
  viewportKey: string;
}) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastKeyRef.current === viewportKey) return;
    lastKeyRef.current = viewportKey;

    const valid = pointsRef.current.filter(([a, b]) => isValidLatLng(a, b));
    if (valid.length === 0) {
      map.setView(DEFAULT_CENTER, 13);
      return;
    }
    if (valid.length === 1) {
      map.setView(valid[0], 16);
      return;
    }
    const bounds = L.latLngBounds(valid);
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16 });
  }, [map, viewportKey]);

  return null;
}

type StaffMarkerProps = {
  ping: StaffLocationPingDto;
  profile?: StaffDirectoryEntry;
  buildings: CampusBuildingDto[];
};

function StaffMarker({ ping, profile, buildings }: StaffMarkerProps) {
  const { t, locale } = useUiText();
  const accent = hueForOwner(ping.owner_key);
  const stale = isPingStale(ping.recorded_at);
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'staff-leaflet-marker',
        html: buildStaffPinHtml(accent, stale),
        iconSize: [STAFF_PIN_W, STAFF_PIN_H],
        iconAnchor: [STAFF_PIN_W / 2, STAFF_PIN_H],
        popupAnchor: [0, -STAFF_PIN_H],
      }),
    [accent, stale],
  );

  const position = useMemo(
    (): [number, number] => [ping.latitude, ping.longitude],
    [ping.latitude, ping.longitude],
  );

  const nearest = useMemo(
    () => matchStaffBuilding(ping.latitude, ping.longitude, buildings),
    [ping.latitude, ping.longitude, buildings],
  );

  const title = profile?.display_name?.trim() || t('admin.staffDefaultName');
  const subtitle = profile?.job_title?.trim() || profile?.department?.trim() || '';

  return (
    <Marker position={position} icon={icon} riseOnHover>
      <Popup maxWidth={340}>
        <div className="min-w-[260px] max-w-[300px] space-y-3 text-[13px] text-black/90">
          <div className="flex gap-3 border-b border-black/10 pb-3">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md"
              style={{ background: `linear-gradient(145deg, ${accent}, #0f172a)` }}
              aria-hidden
            >
              {initialsFromProfile(profile, ping.owner_key)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold leading-tight text-black/95">{title}</div>
              {subtitle ? <div className="mt-0.5 text-[12px] text-black/55">{subtitle}</div> : null}
              <div className="mt-1 font-mono text-[12px] text-sky-700">{profile?.phone_display ?? ping.owner_key}</div>
            </div>
          </div>

          {nearest ? (
            <div
              className={`rounded-xl px-3 py-2 text-[12px] ${
                stale
                  ? 'border border-slate-200 bg-slate-50 text-slate-700'
                  : nearest.inside
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-950'
                    : 'border border-amber-200 bg-amber-50 text-amber-950'
              }`}
            >
              {stale ? (
                t('admin.mapPopup.staleGps')
              ) : nearest.inside ? (
                <>
                  <strong>{t('admin.mapPopup.location')}</strong>{' '}
                  {t('admin.mapPopup.insideBuilding', { building: nearest.building.name })}
                </>
              ) : (
                <>
                  <strong>{t('admin.mapPopup.nearestBuilding')}</strong>{' '}
                  {t('admin.mapPopup.distanceM', {
                    building: nearest.building.name,
                    distance: Math.round(nearest.distance_m),
                  })}
                </>
              )}
            </div>
          ) : null}

          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 text-[12px]">
            {profile?.faculty ? (
              <>
                <dt className="text-black/45">{t('admin.faculty')}</dt>
                <dd className="font-medium text-black/80">{profile.faculty}</dd>
              </>
            ) : null}
            {profile?.department ? (
              <>
                <dt className="text-black/45">{t('admin.department')}</dt>
                <dd className="font-medium text-black/80">{profile.department}</dd>
              </>
            ) : null}
            {profile?.direction ? (
              <>
                <dt className="text-black/45">{t('admin.direction')}</dt>
                <dd className="text-black/80">{profile.direction}</dd>
              </>
            ) : null}
            <dt className="text-black/45">{t('admin.mapPopup.gpsTime')}</dt>
            <dd className="font-medium text-black/85">{formatAge(ping.recorded_at, t, locale)}</dd>
            <dt className="text-black/45">{t('admin.mapPopup.coordinates')}</dt>
            <dd className="font-mono text-[11px] text-black/70">
              {ping.latitude.toFixed(5)}, {ping.longitude.toFixed(5)}
            </dd>
            <dt className="text-black/45">{t('admin.mapPopup.accuracy')}</dt>
            <dd className="text-black/80">
              {ping.accuracy_m != null
                ? t('admin.mapPopup.accuracyValue', { m: Math.round(ping.accuracy_m) })
                : '—'}
            </dd>
          </dl>
        </div>
      </Popup>
    </Marker>
  );
}

function BuildingZone({ building }: { building: CampusBuildingDto }) {
  const { t } = useUiText();
  const radius = building.radius_m > 0 ? building.radius_m : 100;

  return (
    <Circle
      center={[building.latitude, building.longitude]}
      radius={radius}
      pathOptions={{
        color: '#0369a1',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 2,
      }}
    >
      <Popup>
        <div className="text-[13px] font-semibold text-black/90">{building.name}</div>
        {building.short_code ? (
          <div className="text-[11px] text-black/55">
            {t('admin.buildingCodePrefix')} {building.short_code}
          </div>
        ) : null}
        <div className="text-[11px] text-black/60">
          {t('admin.mapPopup.allowedRadius', { radius })}
        </div>
      </Popup>
    </Circle>
  );
}

export type AdminStaffLiveMapPanelProps = {
  pings: StaffLocationPingDto[];
  buildings: CampusBuildingDto[];
  lastUpdated: Date | null;
  pollIntervalSec: number;
  staffDirectory: StaffDirectoryEntry[];
  filterOwnerDigits?: string;
};

/**
 * OpenStreetMap: hodimlar GPS pinglari + bino radiuslari (100 m doira).
 */
export default function AdminStaffLiveMapPanel({
  pings,
  buildings,
  lastUpdated,
  pollIntervalSec,
  staffDirectory,
  filterOwnerDigits = '',
}: AdminStaffLiveMapPanelProps) {
  const { t, locale } = useUiText();

  const latest = useMemo(() => {
    return latestPingByOwner(pings)
      .filter((p) => isValidLatLng(p.latitude, p.longitude))
      .sort((a, b) => a.owner_key.localeCompare(b.owner_key));
  }, [pings]);

  const activeBuildings = useMemo(
    () => buildings.filter((b) => b.is_active && isValidLatLng(b.latitude, b.longitude)),
    [buildings],
  );

  const points = useMemo((): [number, number][] => {
    const pts: [number, number][] = latest.map((p) => [p.latitude, p.longitude]);
    for (const b of activeBuildings) {
      pts.push([b.latitude, b.longitude]);
    }
    return pts;
  }, [latest, activeBuildings]);

  const viewportKey = filterOwnerDigits.replace(/\D/g, '') || '__all__';
  const filterDigits = filterOwnerDigits.replace(/\D/g, '');
  const filteredSelectedNoData = filterDigits.length >= 12 && latest.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-black/65">
        <p>
          {t('admin.mapStaffBuildingSummary', {
            staff: t('admin.liveMapStaffCount', { count: latest.length }),
            buildings: t('admin.liveMapBuildingCount', { count: activeBuildings.length }),
          })}
          {lastUpdated ? (
            <span className="ml-2 text-black/55">
              · {t('admin.liveMapUpdated', { time: lastUpdated.toLocaleTimeString(locale) })}
            </span>
          ) : null}
        </p>
        <p className="font-semibold text-emerald-800">
          {t('admin.liveMapAutoUpdate', { sec: pollIntervalSec })}
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-black/50">{t('admin.liveMapHelp')}</p>

      {filteredSelectedNoData ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
          {t('admin.liveMapNoData')}
        </div>
      ) : null}

      <div className="relative z-0 h-[min(70vh,640px)] min-h-[420px] w-full overflow-hidden rounded-2xl border border-black/10 bg-sky-50/30 shadow-md">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          scrollWheelZoom
          zoomAnimation
          markerZoomAnimation={false}
          className="z-0 h-full w-full [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-popup-content]:m-3 [&_.leaflet-popup-content]:mr-6"
          style={{ height: '100%', width: '100%', minHeight: 420 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LeafletAttributionStrip />
          <MapViewportController points={points} viewportKey={viewportKey} />
          {activeBuildings.map((b) => (
            <BuildingZone key={`b-${b.id}`} building={b} />
          ))}
          {latest.map((p) => (
            <StaffMarker
              key={p.owner_key}
              ping={p}
              profile={findStaffProfile(p.owner_key, staffDirectory)}
              buildings={activeBuildings}
            />
          ))}
        </MapContainer>
      </div>

      <div>
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-black/45">
          {t('admin.liveMapStaffList')}
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {latest.map((p) => {
            const profile = findStaffProfile(p.owner_key, staffDirectory);
            const accent = hueForOwner(p.owner_key);
            const nearest = matchStaffBuilding(p.latitude, p.longitude, activeBuildings);
            const stale = isPingStale(p.recorded_at);
            return (
              <div
                key={p.owner_key}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-[12px] shadow-sm ${
                  stale ? 'border-black/10 bg-black/[0.03] opacity-75' : 'border-black/10 bg-white/95'
                }`}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white shadow"
                  style={{ background: `linear-gradient(145deg, ${accent}, #0f172a)` }}
                  aria-hidden
                >
                  {initialsFromProfile(profile, p.owner_key)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-black/90">{profile?.display_name ?? p.owner_key}</div>
                  {nearest ? (
                    <div className={`truncate text-[11px] ${stale ? 'text-slate-600' : nearest.inside ? 'text-emerald-700' : 'text-amber-800'}`}>
                      {stale
                        ? t('admin.liveMapOldGps')
                        : nearest.inside
                          ? nearest.building.name
                          : t('admin.mapPopup.distanceM', {
                              building: nearest.building.name,
                              distance: Math.round(nearest.distance_m),
                            })}
                    </div>
                  ) : stale ? (
                    <div className="truncate text-[11px] text-slate-600">{t('admin.liveMapOldGps')}</div>
                  ) : null}
                  <div className="text-black/55">{formatAge(p.recorded_at, t, locale)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {latest.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-6 text-center text-[13px] text-black/50">
            <p>{t('admin.liveMapNoGps')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
