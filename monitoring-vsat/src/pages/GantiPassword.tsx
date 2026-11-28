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
import { useApp } from "@/lib/app";
import { cn } from "@/lib/utils";
import { BATAS } from "../../shared/batas";

const PANJANG_MIN = BATAS.passwordMin;

/** Satu syarat password: tanda centang saat terpenuhi. */
function Syarat({ ok, children }: { ok: boolean; children: string }) {
  const Ikon = ok ? Check : Minus;
  return (
    <li
      className={cn(
        "flex items-center gap-2",
        ok ? "text-emerald-700" : "text-muted-foreground",
      )}
    >
      <Ikon className="size-3.5 shrink-0" />
      {children}
    </li>
  );
}

export function GantiPassword({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { api } = useApp();
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const panjang = baru.length >= PANJANG_MIN;
  const beda = baru.length > 0 && baru !== lama;
  const sama = ulang.length > 0 && ulang === baru;
  const siap = lama.length > 0 && panjang && beda && sama;

  const tutup = (v: boolean) => {
    if (!v) {
      setLama("");
      setBaru("");
      setUlang("");
      setGalat("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={tutup}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ganti Password</DialogTitle>
          <DialogDescription>
            Setelah diganti, sesi di perangkat lain akan diakhiri.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!siap || sibuk) return;
            setSibuk(true);
            setGalat("");
            try {
              await api("/api/password", {
                old_password: lama,
                new_password: baru,
              });
              tutup(false);
              toast.success("Password berhasil diganti.");
            } catch (err) {
              setGalat((err as Error).message);
            } finally {
              setSibuk(false);
            }
          }}
        >
          <label className="block">
            <FieldLabel>Password Lama</FieldLabel>
            <InputSandi
              value={lama}
              onChange={(e) => setLama(e.target.value)}
              autoComplete="current-password"
              required
              maxLength={BATAS.passwordMaks}
            />
          </label>
          <div className="border-t pt-4">
            <label className="block">
              <FieldLabel>Password Baru</FieldLabel>
              <InputSandi
                value={baru}
                onChange={(e) => setBaru(e.target.value)}
                autoComplete="new-password"
                required
                minLength={PANJANG_MIN}
                maxLength={BATAS.passwordMaks}
              />
            </label>
            <label className="mt-4 block">
              <FieldLabel>Ulangi Password Baru</FieldLabel>
              <InputSandi
                value={ulang}
                onChange={(e) => setUlang(e.target.value)}
                autoComplete="new-password"
                required
                maxLength={BATAS.passwordMaks}
                aria-invalid={ulang.length > 0 && !sama}
              />
            </label>
            {/* Syarat diperiksa sambil mengetik, supaya tidak menebak kenapa gagal. */}
            <ul className="mt-3 space-y-1 text-xs">
              <Syarat ok={panjang}>{`Minimal ${PANJANG_MIN} karakter`}</Syarat>
              <Syarat ok={beda}>Berbeda dari password lama</Syarat>
              <Syarat ok={sama}>Kedua isian password baru sama</Syarat>
            </ul>
          </div>
          {galat && (
            <p
              role="alert"
              className="border-l-2 border-rose-600 pl-3 text-sm text-rose-800"
            >
              {galat}
            </p>
          )}
          <DialogFooter className="gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => tutup(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={!siap || sibuk}>
              {sibuk ? "Menyimpan…" : "Simpan Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
