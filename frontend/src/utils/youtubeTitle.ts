/**
 * YouTube video sarlavhasini oEmbed orqali olish.
 *
 * Admin video qo'shganda sarlavhani yozmasligi mumkin — u holda ro'yxatda
 * 11 belgili ID ko'rinib qolardi. Shu yerda YouTube'ning ochiq oEmbed
 * endpointidan asl sarlavha olinadi (API kaliti kerak emas, CORS ochiq).
 *
 * Natija localStorage'da keshlanadi — har ochilganda qayta so'ralmasin.
 */

import { useEffect, useState } from 'react';

const CACHE_KEY = 'imentor-youtube-titles-v1';
const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

let diskCacheLoaded = false;

function loadDiskCache(): void {
  if (diskCacheLoaded) return;
  diskCacheLoaded = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, string>;
    for (const [id, title] of Object.entries(map)) {
      if (typeof title === 'string' && title) memoryCache.set(id, title);
    }
  } catch {
    /* buzilgan kesh — e'tiborsiz qoldiriladi */
  }
}

function persist(id: string, title: string): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[id] = title;
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* kvota to'lgan bo'lsa — xotira keshi yetarli */
  }
}

export function cachedYoutubeTitle(youtubeId: string): string {
  if (!youtubeId) return '';
  loadDiskCache();
  return memoryCache.get(youtubeId) ?? '';
}

export async function fetchYoutubeTitle(youtubeId: string): Promise<string> {
  if (!youtubeId) return '';
  loadDiskCache();
  const cached = memoryCache.get(youtubeId);
  if (cached) return cached;

  const pending = inFlight.get(youtubeId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const url =
        'https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`);
      const res = await fetch(url);
      if (!res.ok) return '';
      const data = (await res.json()) as { title?: unknown };
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (title) {
        memoryCache.set(youtubeId, title);
        persist(youtubeId, title);
      }
      return title;
    } catch {
      // Internet yo'q yoki video o'chirilgan — chaqiruvchi zaxira matnni ko'rsatadi.
      return '';
    } finally {
      inFlight.delete(youtubeId);
    }
  })();

  inFlight.set(youtubeId, task);
  return task;
}

/**
 * Ko'rsatiladigan sarlavha: admin yozgani ustuvor, bo'lmasa YouTube'dan.
 * Hech biri bo'lmasa — bo'sh satr (chaqiruvchi o'zi hal qiladi).
 */
export function useYoutubeTitle(youtubeId: string, ownTitle?: string): string {
  const own = (ownTitle || '').trim();
  const [fetched, setFetched] = useState(() => (own ? '' : cachedYoutubeTitle(youtubeId)));

  useEffect(() => {
    if (own || !youtubeId) return;
    const cached = cachedYoutubeTitle(youtubeId);
    if (cached) {
      setFetched(cached);
      return;
    }
    let alive = true;
    void fetchYoutubeTitle(youtubeId).then((title) => {
      if (alive && title) setFetched(title);
    });
    return () => {
      alive = false;
    };
  }, [youtubeId, own]);

  return own || fetched;
}
