import { MAP_STATES, type MapState } from '@tyio/shared';

/** Warna kondisi dari palet status (tervalidasi; selalu disertai label di keterangan). */
export const MAP_STATE_COLORS: Readonly<Record<MapState, string>> = {
  gangguan: '#d03b3b',
  pending: '#fab219',
  normal: '#0ca30c',
  nonaktif: '#8a8a86',
};

/** Kondisi terparah di antara titik dalam satu kelompok (urutan MAP_STATES). */
export function worstState(states: Iterable<MapState>): MapState {
  let worst = MAP_STATES.length - 1;
  for (const state of states) worst = Math.min(worst, MAP_STATES.indexOf(state));
  return MAP_STATES[worst]!;
}

/** Wilayah Indonesia untuk tampilan awal bila belum ada titik. */
export const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [-11, 95],
  [6, 141],
];
