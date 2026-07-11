import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Leaflet pastki burchagidagi default prefix (jumladan flag) ni olib tashlaydi.
 * OpenStreetMap attribution TileLayer orqali alohida ko‘rsatiladi.
 */
export function LeafletAttributionStrip() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(false);
  }, [map]);
  return null;
}
