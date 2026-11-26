// PDF Trouble Ticket untuk teknisi: kop perusahaan, tabel data, kotak hasil
// pekerjaan, dan tempat tanda tangan. jsPDF dimuat hanya saat PDF dibuat.
import type { jsPDF as JsPDF } from "jspdf";
import logoTm from "./aset/logo-tm.png";

const NAVY: [number, number, number] = [3, 36, 89];
const ABU: [number, number, number] = [83, 101, 128];
const GARIS: [number, number, number] = [200, 208, 220];
const KIRI = 16;
const LEBAR = 178; // A4 210 mm dikurangi margin kiri dan kanan
const BAWAH = 283;

export type DataTicket = {
  number: string;
  npr_number: string;
  customer_name: string;
  instruction: string;
  created_at: string;
  notes: string;
  technician: string;
  report: string;
  remote_status?: string;
  npr_started_at?: string;
  site_id: string;
  location: string;
  address: string;
  city: string;
  province: string;
  jarkom: string;
  ip_lan: string;
  pic_name: string;
  pic_phone: string;
};

export type DataGamas = {
  number: string;
  location: string;
  notes: string;
  started_at: string;
  online_at: string | null;
  status: string;
  report: string;
  sites: {
    site_id: string;
    location: string;
    city: string;
    customer_name?: string;
    pic_name: string;
    pic_phone: string;
  }[];
};

export function waktuWib(nilai?: string | null) {
  return nilai
    ? new Date(nilai).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }) + " WIB"
    : "—";
}

async function gambarDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((selesai, gagal) => {
    const reader = new FileReader();
    reader.onload = () => selesai(String(reader.result));
    reader.onerror = gagal;
    reader.readAsDataURL(blob);
  });
}

class Halaman {
  y = 0;
  readonly doc: JsPDF;
  private readonly logo: string;
  constructor(doc: JsPDF, logo: string) {
    this.doc = doc;
    this.logo = logo;
  }

  kop(judul: string, subjudul: string) {
    const { doc } = this;
    doc.addImage(this.logo, "PNG", KIRI, 12, 16, 16);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PT. Tangara Mitrakom", KIRI + 20, 18.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ABU);
    doc.text("Network Problem Report · Helpdesk VSAT & M2M", KIRI + 20, 24);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.8);
    doc.line(KIRI, 31, KIRI + LEBAR, 31);
    doc.setLineWidth(0.2);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(judul, KIRI + LEBAR / 2, 41, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ABU);
    doc.text(subjudul, KIRI + LEBAR / 2, 46.5, { align: "center" });
    this.y = 54;
  }

  // Pindah halaman jika sisa ruang kurang dari `tinggi` mm.
  sisakan(tinggi: number) {
    if (this.y + tinggi > BAWAH) {
      this.doc.addPage();
      this.y = 18;
    }
  }

  judulBagian(teks: string) {
    this.sisakan(14);
    const { doc } = this;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(teks.toUpperCase(), KIRI, this.y);
    this.y += 3;
  }

  // Tabel dua kolom: label di kiri, isi di kanan.
  tabelData(baris: [string, string][], lebarLabel = 44) {
    const { doc } = this;
    doc.setFontSize(9.5);
    for (const [label, isi] of baris) {
      const teks = doc.splitTextToSize(
        isi || "—",
        LEBAR - lebarLabel - 6,
      ) as string[];
      const tinggi = Math.max(7.4, teks.length * 4.6 + 3);
      this.sisakan(tinggi);
      doc.setDrawColor(...GARIS);
      doc.setFillColor(243, 246, 251);
      doc.rect(KIRI, this.y, lebarLabel, tinggi, "FD");
      doc.rect(KIRI + lebarLabel, this.y, LEBAR - lebarLabel, tinggi, "S");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ABU);
      doc.text(label, KIRI + 3, this.y + 4.9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 33, 58);
      doc.text(teks, KIRI + lebarLabel + 3, this.y + 4.9);
      this.y += tinggi;
    }
    this.y += 6;
  }

  // Tabel dengan baris judul. Judul diulang jika tabel pindah halaman.
  tabelDaftar(judul: string[], lebar: number[], baris: string[][]) {
    const { doc } = this;
    const tulisJudul = () => {
      doc.setFillColor(...NAVY);
      doc.rect(KIRI, this.y, LEBAR, 7.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      let x = KIRI;
      judul.forEach((j, i) => {
        doc.text(j, x + 2.5, this.y + 5);
        x += lebar[i];
      });
      this.y += 7.5;
    };
    this.sisakan(16);
    tulisJudul();
    doc.setFont("helvetica", "normal");
    for (const isi of baris) {
      const sel = isi.map(
        (teks, i) => doc.splitTextToSize(teks || "—", lebar[i] - 5) as string[],
      );
      const tinggi = Math.max(
        7.5,
        Math.max(...sel.map((s) => s.length)) * 4.4 + 3,
      );
      if (this.y + tinggi > BAWAH) {
        doc.addPage();
        this.y = 18;
        tulisJudul();
        doc.setFont("helvetica", "normal");
      }
      doc.setDrawColor(...GARIS);
      doc.setTextColor(20, 33, 58);
      doc.setFontSize(9);
      let x = KIRI;
      sel.forEach((teks, i) => {
        doc.rect(x, this.y, lebar[i], tinggi, "S");
        doc.text(teks, x + 2.5, this.y + 5);
        x += lebar[i];
      });
      this.y += tinggi;
    }
    this.y += 7;
  }

  // Kotak isian untuk teknisi. Jika report sudah ada, isinya ditulis.
  kotakHasil(isi: string, baris: string[]) {
    const { doc } = this;
    const teks = isi
      ? (doc.splitTextToSize(isi, LEBAR - 8) as string[])
      : baris;
    const tinggi = Math.max(30, teks.length * (isi ? 4.8 : 10) + 6);
    this.sisakan(tinggi + 4);
    doc.setDrawColor(...GARIS);
    doc.rect(KIRI, this.y, LEBAR, tinggi, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(20, 33, 58);
    if (isi) doc.text(teks, KIRI + 4, this.y + 6.5);
    else
      baris.forEach((label, i) => {
        const yb = this.y + 8 + i * 10;
        doc.setTextColor(...ABU);
        doc.text(label, KIRI + 4, yb);
        doc.setDrawColor(...GARIS);
        doc.line(KIRI + 48, yb + 0.8, KIRI + LEBAR - 4, yb + 0.8);
      });
    this.y += tinggi + 7;
  }

  tandaTangan(namaHelpdesk: string) {
    const { doc } = this;
    this.sisakan(40);
    const lebarKolom = (LEBAR - 10) / 2;
    [
      ["Teknisi", ""],
      ["Helpdesk", namaHelpdesk],
    ].forEach(([peran, nama], i) => {
      const x = KIRI + i * (lebarKolom + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text(peran, x, this.y);
      doc.setDrawColor(...GARIS);
      doc.rect(x, this.y + 3, lebarKolom, 19, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...ABU);
      doc.text(
        `Nama: ${nama || ".............................................."}`,
        x,
        this.y + 28,
      );
      doc.text("Tanggal: ..................................", x, this.y + 33.5);
    });
    this.y += 38;
  }

  kakiHalaman(dicetakOleh: string) {
    const { doc } = this;
    const total = doc.getNumberOfPages();
    const dicetak = `Dicetak ${waktuWib(new Date().toISOString())} oleh ${dicetakOleh}`;
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...GARIS);
      doc.line(KIRI, 287, KIRI + LEBAR, 287);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...ABU);
      doc.text(dicetak, KIRI, 291.5);
      doc.text(`Halaman ${i} dari ${total}`, KIRI + LEBAR, 291.5, {
        align: "right",
      });
    }
  }
}

async function mulai() {
  const [{ jsPDF }, logo] = await Promise.all([
    import("jspdf"),
    gambarDataUrl(logoTm),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  return new Halaman(doc, logo);
}

const namaBerkas = (nomor: string) => nomor.replaceAll("/", "-") + ".pdf";

export async function pdfTicket(t: DataTicket, pencetak: string) {
  const h = await mulai();
  h.kop("TROUBLE TICKET", "Permintaan kunjungan teknisi");
  h.tabelData([
    ["Nomor TT", t.number],
    ["Referensi NPR", t.npr_number],
    ["Tanggal TT", waktuWib(t.created_at)],
    ["Instruksi", t.instruction],
  ]);
  h.judulBagian("Data site");
  h.tabelData([
    ["Customer", t.customer_name],
    ["Site ID", t.site_id],
    ["Lokasi", t.location],
    ["Alamat", `${t.address}, ${t.city}, ${t.province}`],
    ["Jarkom / IP LAN", `${t.jarkom} / ${t.ip_lan}`],
    ["PIC / Telepon", `${t.pic_name} / ${t.pic_phone}`],
  ]);
  h.judulBagian("Gangguan");
  h.tabelData([
    ["Jenis gangguan", t.remote_status ?? ""],
    ["Mulai gangguan", waktuWib(t.npr_started_at)],
    ["Catatan NOC", t.notes],
  ]);
  h.judulBagian("Hasil pekerjaan teknisi");
  h.kotakHasil(
    t.report
      ? `${t.report}${t.technician ? `\n\nTeknisi: ${t.technician}` : ""}`
      : "",
    [
      "Tindakan yang dilakukan",
      "Penyebab gangguan",
      "Waktu selesai",
      "Kondisi akhir",
    ],
  );
  h.tandaTangan(pencetak);
  h.kakiHalaman(pencetak);
  h.doc.save(namaBerkas(t.number));
}

export async function pdfGamas(g: DataGamas, pencetak: string) {
  const h = await mulai();
  h.kop("TROUBLE TICKET GANGGUAN MASSAL", "Penanganan gangguan banyak site");
  h.tabelData([
    ["Nomor TT Gamas", g.number],
    ["Lokasi penanganan", g.location],
    ["Mulai gangguan", waktuWib(g.started_at)],
    ["Status", g.status],
    ["Kembali online", waktuWib(g.online_at)],
    ["Catatan", g.notes],
  ]);
  h.judulBagian(`Site terdampak (${g.sites.length})`);
  h.tabelDaftar(
    ["No.", "Site ID", "Lokasi", "Kota", "Customer", "PIC / Telepon"],
    [11, 27, 42, 26, 30, 42],
    g.sites.map((s, i) => [
      String(i + 1),
      s.site_id,
      s.location,
      s.city,
      s.customer_name ?? "",
      `${s.pic_name} / ${s.pic_phone}`,
    ]),
  );
  h.judulBagian("Hasil pekerjaan teknisi");
  h.kotakHasil(g.report, [
    "Tindakan yang dilakukan",
    "Penyebab gangguan",
    "Waktu selesai",
    "Kondisi akhir",
  ]);
  h.tandaTangan(pencetak);
  h.kakiHalaman(pencetak);
  h.doc.save(namaBerkas(g.number));
}
