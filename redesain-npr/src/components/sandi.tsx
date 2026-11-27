import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Isian password dengan tombol tampilkan/sembunyikan (dipakai di Login dan Ganti Password). */
export function InputSandi({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [lihat, setLihat] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={lihat ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setLihat((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
        aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}
      >
        {lihat ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
