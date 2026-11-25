import { OVERVIEW_DAY_ZONE_IANA } from '@npr/shared';

// Hari menurut WIB untuk semua NPR (T109), di SQL. Satu tempat untuk kedua arah: tanggal dari
// waktu (tren harian, "hari ini" Overview) dan awal hari dari tanggal (saringan antrean), jadi
// angka Overview dan daftar yang dibuka darinya memakai batas hari yang sama.

/** Tanggal WIB `YYYY-MM-DD` dari ekspresi timestamptz, dikurangi `minusDays` hari (ekspresi SQL). */
export function wibDateSql(timestamp: string, minusDays = '0'): string {
  return `to_char((${timestamp} AT TIME ZONE '${OVERVIEW_DAY_ZONE_IANA}')::date - ${minusDays}, 'YYYY-MM-DD')`;
}

/** Awal hari (00:00 WIB) tanggal di parameter `:param` sebagai timestamptz; `nextDay` = hari berikutnya. */
export function wibDayStartSql(param: string, nextDay = false): string {
  return `((CAST(:${param} AS date)${nextDay ? ' + 1' : ''})::timestamp AT TIME ZONE '${OVERVIEW_DAY_ZONE_IANA}')`;
}
