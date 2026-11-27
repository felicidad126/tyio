import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/npr";
import { InputSandi } from "@/components/sandi";
import { cn } from "@/lib/utils";

/** Satu syarat password: tanda centang saat terpenuhi. */
function Syarat({ ok, children }: { ok: boolean; children: string }) {
  const Ikon = ok ? Check : Minus;
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-emerald-700" : "text-muted-foreground")}>
      <Ikon className="size-3.5 shrink-0" />
      {children}
    </li>
  );
}

export function GantiPassword({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const panjang = baru.length >= 12;
  const beda = baru.length > 0 && baru !== lama;
  const sama = ulang.length > 0 && ulang === baru;
  const siap = lama.length > 0 && panjang && beda && sama;

  const tutup = (v: boolean) => {
    if (!v) { setLama(""); setBaru(""); setUlang(""); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={tutup}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ganti Password</DialogTitle>
          <DialogDescription>Setelah diganti, sesi di perangkat lain akan diakhiri.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!siap) return;
            tutup(false);
            toast.success("Password berhasil diganti.");
          }}
        >
          <label className="block">
            <FieldLabel>Password Lama</FieldLabel>
            <InputSandi value={lama} onChange={(e) => setLama(e.target.value)} autoComplete="current-password" required />
          </label>
          <div className="border-t pt-4">
            <label className="block">
              <FieldLabel>Password Baru</FieldLabel>
              <InputSandi value={baru} onChange={(e) => setBaru(e.target.value)} autoComplete="new-password" required minLength={12} />
            </label>
            <label className="mt-4 block">
              <FieldLabel>Ulangi Password Baru</FieldLabel>
              <InputSandi value={ulang} onChange={(e) => setUlang(e.target.value)} autoComplete="new-password" required aria-invalid={ulang.length > 0 && !sama} />
            </label>
            {/* Syarat diperiksa sambil mengetik, supaya tidak menebak kenapa gagal. */}
            <ul className="mt-3 space-y-1 text-xs">
              <Syarat ok={panjang}>Minimal 12 karakter</Syarat>
              <Syarat ok={beda}>Berbeda dari password lama</Syarat>
              <Syarat ok={sama}>Kedua isian password baru sama</Syarat>
            </ul>
          </div>
          <DialogFooter className="gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => tutup(false)}>Batal</Button>
            <Button type="submit" disabled={!siap}>Simpan Password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
