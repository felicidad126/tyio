import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

/**
 * Leaflet dan Leaflet.markercluster, dimuat hanya saat peta dibuka (bundel terpisah).
 * markercluster adalah plugin UMD yang menempel ke `window.L`, jadi Leaflet dipasang di sana
 * lebih dulu (salinan objek modul, karena namespace ESM tidak bisa ditambahi).
 */
export type Leaflet = typeof import('leaflet');

let loading: Promise<Leaflet> | undefined;

export function loadLeaflet(): Promise<Leaflet> {
  loading ??= (async () => {
    const module = await import('leaflet');
    const L = Object.assign({}, module) as Leaflet;
    (window as unknown as { L: Leaflet }).L = L;
    await import('leaflet.markercluster');
    return (window as unknown as { L: Leaflet }).L;
  })();
  return loading;
}
