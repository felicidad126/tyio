import { useEffect } from "react";
import type { ReactNode } from "react";

export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

// Jendela form di atas halaman. Bisa ditutup dengan tombol × atau Esc.
export function Modal({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    function tutup(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", tutup);
    return () => document.removeEventListener("keydown", tutup);
  }, [onClose, busy]);

  return (
    <div className="modal-overlay">
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-title">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Tutup form" disabled={busy}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
