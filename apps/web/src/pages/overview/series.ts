// Warna seri tren "Tiket baru per hari" (T114). Palet kategori tervalidasi (validator dataviz:
// lolos pemisahan buta warna dan batas penglihatan normal di tema terang dan gelap); nilainya
// di CSS (`--series-1` … `--series-7`, tema gelap memakai langkah gelapnya sendiri).
//
// Warna mengikuti kategori, bukan peringkatnya, jadi tidak berganti saat periode diganti:
// tiga kategori sistem lama (rencana induk §3) selalu di slot 1–3 seperti mockup; kategori
// lain di slot 4–7 menurut abjad; sisanya digabung menjadi "Kategori lain" (abu-abu).

export const SERIES_SLOTS = 7;
const KNOWN = [/^remote\s*down/i, /^corrective/i, /^preventive/i];

/** Slot warna (0–6) tiap kategori; `-1` = digabung ke "Kategori lain". */
export function seriesSlots(names: readonly string[]): Map<string, number> {
  const slots = new Map<string, number>();
  const others: string[] = [];
  for (const name of names) {
    const known = KNOWN.findIndex((pattern) => pattern.test(name.trim()));
    if (known >= 0 && ![...slots.values()].includes(known)) slots.set(name, known);
    else others.push(name);
  }
  others.sort((a, b) => a.localeCompare(b, 'id'));
  let next = KNOWN.length;
  for (const name of others) slots.set(name, next < SERIES_SLOTS ? next++ : -1);
  return slots;
}

export function seriesColor(slot: number): string {
  return slot < 0 ? 'var(--series-other)' : `var(--series-${slot + 1})`;
}
