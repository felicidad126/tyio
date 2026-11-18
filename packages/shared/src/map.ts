import type { RemoteStatus } from './remotes.js';

/**
 * Peta remote (langkah 2.3): satu titik per remote yang berkoordinat, berwarna menurut
 * kondisinya sekarang. Urutan = tingkat keparahan (kelompok titik memakai yang terparah).
 */
export const MAP_STATES = ['gangguan', 'pending', 'normal', 'nonaktif'] as const;
export type MapState = (typeof MAP_STATES)[number];

export const MAP_STATE_LABELS: Readonly<Record<MapState, string>> = {
  gangguan: 'Gangguan (NPR aktif)',
  pending: 'Pending',
  normal: 'Normal',
  nonaktif: 'Nonaktif / Dismantle',
};

/**
 * Kondisi remote di peta: NPR aktif yang belum pending = gangguan; semua NPR aktifnya pending =
 * pending; tanpa NPR aktif = normal, kecuali remote nonaktif atau Dismantle.
 */
export function mapState(remoteStatus: RemoteStatus, activeTickets: number, pendingTickets: number): MapState {
  if (activeTickets > pendingTickets) return 'gangguan';
  if (activeTickets > 0) return 'pending';
  return remoteStatus === 'aktif' ? 'normal' : 'nonaktif';
}

export interface MapRemote {
  id: string;
  siteId: string;
  name: string;
  city: string;
  tenantId: string;
  /** Nama customer. */
  tenant: string;
  lat: number;
  lng: number;
  state: MapState;
  /** NPR yang belum Selesai. */
  activeTickets: number;
}

/**
 * Kondisi terkini saja, untuk pembaruan langsung (kecil: hanya remote berkoordinat yang tidak
 * normal). Remote yang tidak disebut berarti normal tanpa NPR aktif.
 */
export interface MapStatesResponse {
  states: Array<{ id: string; tenantId: string; state: Exclude<MapState, 'normal'>; activeTickets: number }>;
}

export interface MapResponse {
  /** Sumber gambar peta (URL dengan {z}/{x}/{y}) dan atribusinya; diatur di server. */
  tiles: { url: string; attribution: string };
  /** Remote berkoordinat yang boleh dilihat, urut Site ID. */
  remotes: MapRemote[];
  /** Remote tanpa koordinat (tidak tampil di peta). */
  withoutCoordinates: number;
}
