/**
 * Bunyi peringatan layar dinding (2.4), dibuat dengan Web Audio (tanpa berkas suara): dua nada
 * naik, ±0,7 detik. Browser menahan suara sampai ada klik di halaman, kecuali dijalankan dengan
 * `--autoplay-policy=no-user-gesture-required` (mode kios).
 */
export class Chime {
  private context: AudioContext | null = null;

  constructor() {
    try {
      this.context = new AudioContext();
    } catch {
      this.context = null;
    }
  }

  /** Suara boleh dimainkan (sudah ada klik, atau browser mode kios). */
  get ready(): boolean {
    return this.context?.state === 'running';
  }

  async unlock(): Promise<boolean> {
    if (!this.context) return false;
    if (this.context.state !== 'running') await this.context.resume().catch(() => undefined);
    return this.ready;
  }

  /** Memainkan bunyi; mengembalikan false bila browser belum mengizinkan suara. */
  play(): boolean {
    const context = this.context;
    if (!context || context.state !== 'running') return false;
    const start = context.currentTime;
    for (const [offset, frequency] of [
      [0, 660],
      [0.32, 880],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.34);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.36);
    }
    return true;
  }

  close(): void {
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
