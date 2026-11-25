import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Field, Modal } from "./komponen";
import { namaPeran, type Peran } from "./peran";

type Akun = {
  id: number;
  username: string;
  full_name: string;
  peran: Peran;
  aktif: number;
  created_at: string;
};
type Api = <T>(path: string, body?: unknown) => Promise<T>;

const PANJANG_MIN_PASSWORD = 12;

function PasswordInput({ name, label }: { name: string; label: string }) {
  return (
    <Field label={label}>
      <input
        name={name}
        type="password"
        required
        minLength={PANJANG_MIN_PASSWORD}
        maxLength={256}
        autoComplete="new-password"
      />
    </Field>
  );
}

function useKirim(onSelesai: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function kirim(aksi: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await aksi();
      onSelesai();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, kirim };
}

// Ganti password sendiri. Dipakai oleh semua pengguna, dari tombol di topbar.
export function GantiPassword({
  api,
  onClose,
  onDone,
}: {
  api: Api;
  onClose: () => void;
  onDone: () => void;
}) {
  const { busy, error, kirim } = useKirim(onDone);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    if (f.get("new_password") !== f.get("confirm_password")) {
      void kirim(() =>
        Promise.reject(new Error("Ulangi password baru dengan sama persis.")),
      );
      return;
    }
    void kirim(() =>
      api("/api/password", {
        old_password: f.get("old_password"),
        new_password: f.get("new_password"),
      }),
    );
  }
  return (
    <Modal title="Ganti password" onClose={onClose} busy={busy}>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            <Field label="Password lama" wide>
              <input
                name="old_password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <PasswordInput
              name="new_password"
              label={`Password baru (minimal ${PANJANG_MIN_PASSWORD} karakter)`}
            />
            <PasswordInput
              name="confirm_password"
              label="Ulangi password baru"
            />
          </div>
          <div className="form-footer">
            <button type="button" onClick={onClose}>
              Batal
            </button>
            <button className="primary">
              {busy ? "Menyimpan…" : "Simpan password"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

type Form =
  | { jenis: "tambah" }
  | { jenis: "ubah"; akun: Akun }
  | { jenis: "reset"; akun: Akun };

function FormAkun({
  form,
  api,
  onClose,
  onDone,
}: {
  form: Form;
  api: Api;
  onClose: () => void;
  onDone: (pesan: string) => void;
}) {
  const pesan =
    form.jenis === "tambah"
      ? "Akun berhasil dibuat."
      : form.jenis === "ubah"
        ? "Data akun berhasil disimpan."
        : `Password ${form.akun.username} berhasil diganti.`;
  const { busy, error, kirim } = useKirim(() => onDone(pesan));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    if (form.jenis === "tambah")
      void kirim(() =>
        api("/api/users", {
          username: f.get("username"),
          full_name: f.get("full_name"),
          peran: f.get("peran"),
          password: f.get("password"),
        }),
      );
    else if (form.jenis === "ubah")
      void kirim(() =>
        api(`/api/users/${form.akun.id}`, {
          full_name: f.get("full_name"),
          peran: f.get("peran"),
          aktif: form.akun.aktif === 1,
        }),
      );
    else
      void kirim(() =>
        api(`/api/users/${form.akun.id}/password`, {
          password: f.get("password"),
        }),
      );
  }

  const judul =
    form.jenis === "tambah"
      ? "Tambah akun"
      : form.jenis === "ubah"
        ? `Ubah akun ${form.akun.username}`
        : `Reset password ${form.akun.username}`;

  return (
    <Modal title={judul} onClose={onClose} busy={busy}>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            {form.jenis === "tambah" && (
              <Field label="Username (huruf kecil, angka, titik, minus)">
                <input
                  name="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-z0-9._\-]+"
                  autoComplete="off"
                />
              </Field>
            )}
            {form.jenis !== "reset" && (
              <>
                <Field label="Nama lengkap">
                  <input
                    name="full_name"
                    required
                    maxLength={100}
                    defaultValue={
                      form.jenis === "ubah" ? form.akun.full_name : ""
                    }
                  />
                </Field>
                <Field label="Peran">
                  <select
                    name="peran"
                    defaultValue={
                      form.jenis === "ubah" ? form.akun.peran : "helpdesk"
                    }
                  >
                    <option value="helpdesk">Helpdesk</option>
                    <option value="admin">Admin (bisa mengelola akun)</option>
                  </select>
                </Field>
              </>
            )}
            {form.jenis !== "ubah" && (
              <PasswordInput
                name="password"
                label={`Password (minimal ${PANJANG_MIN_PASSWORD} karakter)`}
              />
            )}
          </div>
          <div className="form-footer">
            <button type="button" onClick={onClose}>
              Batal
            </button>
            <button className="primary">
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

// Halaman Pengguna, hanya tampil untuk admin.
export function HalamanPengguna({
  api,
  penggunaId,
  onNotice,
}: {
  api: Api;
  penggunaId: number;
  onNotice: (pesan: string) => void;
}) {
  const [akun, setAkun] = useState<Akun[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const muat = useCallback(async () => {
    try {
      const hasil = await api<{ users: Akun[] }>("/api/users");
      setAkun(hasil.users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    let aktif = true;
    api<{ users: Akun[] }>("/api/users")
      .then((hasil) => {
        if (aktif) setAkun(hasil.users);
      })
      .catch((e: Error) => {
        if (aktif) setError(e.message);
      });
    return () => {
      aktif = false;
    };
  }, [api]);

  async function ubahStatus(a: Akun) {
    setBusyId(a.id);
    setError("");
    try {
      await api(`/api/users/${a.id}`, {
        full_name: a.full_name,
        peran: a.peran,
        aktif: a.aktif !== 1,
      });
      onNotice(
        a.aktif === 1
          ? `Akun ${a.username} dinonaktifkan.`
          : `Akun ${a.username} diaktifkan kembali.`,
      );
      await muat();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Akun pengguna</h2>
        <button
          className="primary"
          onClick={() => setForm({ jenis: "tambah" })}
        >
          + Tambah akun
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Username</th>
              <th>Peran</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {akun.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.full_name}</strong>
                  {a.id === penggunaId && <small>Akun Anda</small>}
                </td>
                <td className="mono">{a.username}</td>
                <td>{namaPeran[a.peran]}</td>
                <td>
                  <span
                    className={`status ${a.aktif === 1 ? "status-closed" : "status-pending"}`}
                  >
                    {a.aktif === 1 ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td>
                  <div className="button-group">
                    <button onClick={() => setForm({ jenis: "ubah", akun: a })}>
                      Ubah
                    </button>
                    <button
                      onClick={() => setForm({ jenis: "reset", akun: a })}
                    >
                      Reset password
                    </button>
                    {a.id !== penggunaId && (
                      <button
                        disabled={busyId === a.id}
                        onClick={() => void ubahStatus(a)}
                      >
                        {a.aktif === 1 ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <FormAkun
          form={form}
          api={api}
          onClose={() => setForm(null)}
          onDone={(pesan) => {
            setForm(null);
            onNotice(pesan);
            void muat();
          }}
        />
      )}
    </section>
  );
}
