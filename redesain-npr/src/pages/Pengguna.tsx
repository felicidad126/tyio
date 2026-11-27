import { useMemo, useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, FieldLabel, PageHeader, waktu } from "@/components/npr";
import { BarisRingkasan, KepalaUrut, Toolbar, urutkan, useUrut, type Chip } from "@/components/tabel";
import { gamas, nprs, users, type User } from "@/lib/data";
import { cn } from "@/lib/utils";

type Form = { jenis: "tambah" } | { jenis: "ubah" | "reset"; akun: User };
type Kolom = "nama" | "username" | "peran" | "status" | "npr" | "tt" | "bulanIni" | "aktivitas";

const SAYA = 1;
const LABEL_PERAN: Record<string, string> = { admin: "Admin", helpdesk: "Helpdesk" };
const KET_PERAN: Record<string, string> = {
  helpdesk: "Mencatat NPR, TT, dan TT Gamas.",
  admin: "Seperti helpdesk, ditambah mengelola akun pengguna.",
};

/** Angka per akun, dihitung dari riwayat NPR dan TT Gamas yang sudah ada. */
function aktivitas(u: User) {
  const tindakan = [
    ...nprs.flatMap((n) => n.actions.filter((a) => a.created_by === u.full_name).map((a) => ({ at: a.occurred_at, jenis: a.kind, ref: n.number }))),
    ...gamas.flatMap((g) => g.actions.map((a, i) => ({ a, i })).filter(({ a }) => a.by === u.full_name).map(({ a, i }) => ({ at: a.at, jenis: i === 0 ? "Create Gamas" : a.report ? "Report Teknisi" : "Perkembangan", ref: g.number }))),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const bulan = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  return {
    npr: nprs.filter((n) => n.created_by === u.full_name).length,
    tt: tindakan.filter((t) => t.jenis === "Eskalasi Service").length,
    bulanIni: tindakan.filter((t) => new Date(Date.parse(t.at) + 7 * 3600_000).toISOString().slice(0, 7) === bulan).length,
    terakhir: tindakan[0] as { at: string; jenis: string; ref: string } | undefined,
  };
}

/** Status akun: pola sama dengan status NPR (kotak kecil + teks). */
function StatusAkun({ aktif }: { aktif: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", aktif ? "text-emerald-700" : "text-muted-foreground")}>
      <span className={cn("size-2 shrink-0", aktif ? "bg-emerald-600" : "bg-slate-400")} />
      {aktif ? "Aktif" : "Nonaktif"}
    </span>
  );
}

function MenuAksi({ u, onForm }: { u: User; onForm: (f: Form) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" aria-label={`Aksi untuk ${u.username}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onForm({ jenis: "ubah", akun: u })}><Pencil className="mr-2 size-4" /> Ubah Nama dan Peran</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onForm({ jenis: "reset", akun: u })}><KeyRound className="mr-2 size-4" /> Reset Password</DropdownMenuItem>
        {u.id !== SAYA && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={u.aktif ? "text-destructive focus:text-destructive" : ""}
              onClick={() => toast.success(u.aktif ? `Akun ${u.username} dinonaktifkan.` : `Akun ${u.username} diaktifkan kembali.`)}
            >
              {u.aktif ? <UserX className="mr-2 size-4" /> : <UserCheck className="mr-2 size-4" />}
              {u.aktif ? "Nonaktifkan" : "Aktifkan Kembali"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PenggunaPage() {
  const [form, setForm] = useState<Form | null>(null);
  const [peranBaru, setPeranBaru] = useState("helpdesk");
  const [cari, setCari] = useState("");
  const [peran, setPeran] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [urut, gantiUrut] = useUrut<Kolom>({ kolom: "status", arah: "naik" }, ["npr", "tt", "bulanIni", "aktivitas"]);

  const semua = useMemo(() => users.map((u) => ({ ...u, ak: aktivitas(u) })), []);
  const hasil = useMemo(
    () =>
      urutkan(
        semua.filter(
          (u) =>
            `${u.full_name} ${u.username}`.toLowerCase().includes(cari.toLowerCase()) &&
            (peran === "semua" || u.peran === peran) &&
            (status === "semua" || (status === "aktif") === u.aktif),
        ),
        (u) => {
          switch (urut.kolom) {
            case "nama": return u.full_name.toLowerCase();
            case "username": return u.username;
            case "peran": return u.peran;
            case "status": return u.aktif ? 0 : 1;
            case "npr": return u.ak.npr;
            case "tt": return u.ak.tt;
            case "bulanIni": return u.ak.bulanIni;
            case "aktivitas": return u.ak.terakhir ? Date.parse(u.ak.terakhir.at) : 0;
          }
        },
        urut.arah,
        (a, b) => a.full_name.localeCompare(b.full_name),
      ),
    [semua, cari, peran, status, urut],
  );

  const chip = [
    peran !== "semua" && { label: `Peran: ${LABEL_PERAN[peran]}`, hapus: () => setPeran("semua") },
    status !== "semua" && { label: status === "aktif" ? "Aktif" : "Nonaktif", hapus: () => setStatus("semua") },
  ].filter(Boolean) as Chip[];
  const hapusFilter = () => { setPeran("semua"); setStatus("semua"); };
  const bukaForm = (f: Form) => {
    setPeranBaru(f.jenis === "ubah" ? f.akun.peran : "helpdesk");
    setForm(f);
  };

  return (
    <>
      <PageHeader
        title="Pengguna"
        desc="Akun yang bisa masuk ke NPR. Hanya admin yang dapat mengelola akun."
        actions={<Button onClick={() => bukaForm({ jenis: "tambah" })}><Plus className="size-4" /> Tambah Akun</Button>}
      />

      <div className="rounded-md border bg-card">
        <Toolbar cari={cari} onCari={setCari} placeholder="Cari Nama atau Username" jumlahFilter={chip.length} onHapusFilter={hapusFilter}>
          <label className="block">
            <FieldLabel>Peran</FieldLabel>
            <Select value={peran} onValueChange={setPeran}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Peran</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="helpdesk">Helpdesk</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <FieldLabel>Status</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                <SelectItem value="aktif">Aktif</SelectItem>
                <SelectItem value="nonaktif">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </Toolbar>
        <BarisRingkasan jumlah={hasil.length} satuan="akun" chip={chip} onHapusSemua={hapusFilter} />

        {hasil.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              {/* Kolom berlebar tetap; Tindakan Terakhir (isi teks) mengisi sisa
                  ruang. Layar ≥1536 px menampilkan dua kolom angka tambahan. */}
              <table className="w-full min-w-[960px] table-fixed text-[13px]">
                <colgroup>
                  {/* ≥1880 px: kolom diperlebar merata supaya sisa ruang tidak
                      menumpuk di satu tempat. */}
                  <col className="w-[210px] min-[1880px]:w-[250px]" />
                  <col className="w-[130px] min-[1880px]:w-[160px]" />
                  <col className="w-[105px] min-[1880px]:w-[130px]" />
                  <col className="w-[110px] min-[1880px]:w-[135px]" />
                  <col className="w-[115px] min-[1880px]:w-[140px]" />
                  <col className="hidden w-[105px] 2xl:table-column min-[1880px]:w-[130px]" />
                  <col className="hidden w-[155px] 2xl:table-column min-[1880px]:w-[180px]" />
                  <col />
                  <col className="w-[56px]" />
                </colgroup>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <KepalaUrut kolom="nama" urut={urut} onUrut={gantiUrut}>Nama Lengkap</KepalaUrut>
                    <KepalaUrut kolom="username" urut={urut} onUrut={gantiUrut}>Username</KepalaUrut>
                    <KepalaUrut kolom="peran" urut={urut} onUrut={gantiUrut}>Peran</KepalaUrut>
                    <KepalaUrut kolom="status" urut={urut} onUrut={gantiUrut}>Status</KepalaUrut>
                    <KepalaUrut kolom="npr" urut={urut} onUrut={gantiUrut} className="text-right [&>button]:flex-row-reverse">NPR Dicatat</KepalaUrut>
                    <KepalaUrut kolom="tt" urut={urut} onUrut={gantiUrut} className="hidden text-right 2xl:table-cell [&>button]:flex-row-reverse">TT Dibuat</KepalaUrut>
                    <KepalaUrut kolom="bulanIni" urut={urut} onUrut={gantiUrut} className="hidden text-right 2xl:table-cell [&>button]:flex-row-reverse">Tindakan Bulan Ini</KepalaUrut>
                    <KepalaUrut kolom="aktivitas" urut={urut} onUrut={gantiUrut} className="pl-8">Tindakan Terakhir</KepalaUrut>
                    <th><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hasil.map((u) => (
                    <tr key={u.id} className={cn(!u.aktif && "text-muted-foreground")}>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{u.full_name}</span>
                        {u.id === SAYA && <span className="ml-1.5 text-xs text-muted-foreground">(Anda)</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">@{u.username}</td>
                      <td className="px-4 py-3">{LABEL_PERAN[u.peran]}</td>
                      <td className="px-4 py-3"><StatusAkun aktif={u.aktif} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{u.ak.npr}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums 2xl:table-cell">{u.ak.tt}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums 2xl:table-cell">{u.ak.bulanIni}</td>
                      <td className="py-3 pl-8 pr-4">
                        {u.ak.terakhir ? (
                          <>
                            <div>{u.ak.terakhir.jenis} <span className="text-muted-foreground">· {u.ak.terakhir.ref}</span></div>
                            <div className="text-xs text-muted-foreground tabular-nums">{waktu(u.ak.terakhir.at)}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Belum ada tindakan</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right"><MenuAksi u={u} onForm={bukaForm} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {hasil.map((u) => (
                <li key={u.id} className="flex items-start gap-2 py-3.5 pl-4 pr-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-sm font-semibold", !u.aktif && "text-muted-foreground")}>
                        {u.full_name}
                        {u.id === SAYA && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Anda)</span>}
                      </span>
                      <span className="text-xs"><StatusAkun aktif={u.aktif} /></span>
                    </div>
                    <div className="text-xs text-muted-foreground">@{u.username} · {LABEL_PERAN[u.peran]}</div>
                    <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                      {u.ak.npr} NPR dicatat · {u.ak.terakhir ? `terakhir ${u.ak.terakhir.jenis}, ${waktu(u.ak.terakhir.at)}` : "belum ada tindakan"}
                    </div>
                  </div>
                  <MenuAksi u={u} onForm={bukaForm} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={Search}
            title="Tidak ada akun yang cocok"
            desc="Ubah kata kunci atau hapus filter."
            action={<Button variant="outline" onClick={() => { setCari(""); hapusFilter(); }}>Hapus Semua Filter</Button>}
          />
        )}
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.jenis === "tambah" ? "Tambah Akun" : form?.jenis === "ubah" ? `Ubah Akun @${form.akun.username}` : `Reset Password @${form?.akun.username}`}
            </DialogTitle>
            <DialogDescription>
              {form?.jenis === "reset" ? "Semua sesi akun ini akan diakhiri. Sampaikan password baru langsung ke pemilik akun." : "Akun dipakai untuk masuk ke NPR."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setForm(null); toast.success("Akun berhasil disimpan."); }}>
            {form?.jenis === "tambah" && (
              <label className="block">
                <FieldLabel hint="Huruf kecil, angka, titik, minus">Username</FieldLabel>
                <Input required minLength={3} placeholder="Mis. rina" />
              </label>
            )}
            {form?.jenis !== "reset" && (
              <>
                <label className="block">
                  <FieldLabel>Nama Lengkap</FieldLabel>
                  <Input required defaultValue={form?.jenis === "ubah" ? form.akun.full_name : ""} />
                </label>
                <div>
                  <FieldLabel>Peran</FieldLabel>
                  <ToggleGroup type="single" value={peranBaru} onValueChange={(v) => v && setPeranBaru(v)} className="inline-flex justify-start rounded-md border p-0.5">
                    {["helpdesk", "admin"].map((p) => (
                      <ToggleGroupItem key={p} value={p} className="h-8 px-5 data-[state=on]:bg-navy data-[state=on]:text-white">{LABEL_PERAN[p]}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="mt-1.5 text-xs text-muted-foreground">{KET_PERAN[peranBaru]}</p>
                </div>
              </>
            )}
            {form?.jenis !== "ubah" && (
              <label className="block">
                <FieldLabel hint="Minimal 12 karakter">{form?.jenis === "reset" ? "Password Baru" : "Password"}</FieldLabel>
                <Input type="password" required minLength={12} autoComplete="new-password" />
              </label>
            )}
            <DialogFooter className="gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Batal</Button>
              <Button type="submit">{form?.jenis === "reset" ? "Reset Password" : "Simpan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
