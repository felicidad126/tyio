import { domain, ApiError } from "./domain.js";
import { pengguna, type Pengguna } from "./pengguna.js";
import { hashPassword, hashesMatch } from "./sandi.js";

type UserRow = {
  id: number;
  username: string;
  full_name: string;
  password_hash: string;
  password_salt: string;
  peran: "admin" | "helpdesk";
  aktif: number;
};

// Pengguna dari sesi yang masih berlaku. Akun nonaktif dianggap tidak login.
function penggunaSesi(env: Env, sessionId: string) {
  return env.DB.prepare(
    `SELECT users.id, users.username, users.full_name, users.peran
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ? AND users.aktif = 1`,
  )
    .bind(sessionId, Date.now())
    .first<Pengguna>();
}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(data, {
    status,
    headers: responseHeaders,
  });
}

function sessionCookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `npr_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function getSessionId(request: Request) {
  const cookies = request.headers.get("Cookie") ?? "";

  return cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("npr_session="))
    ?.slice("npr_session=".length);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Batasi permintaan perubahan data ke asal aplikasi sendiri.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers.get("Origin") !== url.origin) {
        return json({ message: "Asal permintaan tidak diizinkan." }, 403);
      }
    }

    if (url.pathname === "/api/login" && request.method === "POST") {
      let body: { username?: unknown; password?: unknown };

      try {
        body = await request.json();
      } catch {
        return json({ message: "Format permintaan tidak valid." }, 400);
      }

      if (
        !body ||
        typeof body.username !== "string" ||
        typeof body.password !== "string" ||
        !body.username.trim() ||
        !body.password ||
        body.username.length > 100 ||
        body.password.length > 256
      ) {
        return json(
          { message: "Isi username dan password dengan benar." },
          400,
        );
      }

      const rateKey = request.headers.get("CF-Connecting-IP") ?? "local";
      const now = Date.now();

      // Bersihkan sesi dan catatan percobaan login yang sudah kedaluwarsa,
      // supaya kedua tabel ini tidak terus membesar.
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
        env.DB.prepare("DELETE FROM login_attempts WHERE reset_at <= ?").bind(
          now,
        ),
      ]);

      await env.DB.prepare(
        "INSERT INTO login_attempts(key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END",
      )
        .bind(rateKey, now + 900000, now, now, now + 900000)
        .run();
      const rate = await env.DB.prepare(
        "SELECT attempts FROM login_attempts WHERE key=?",
      )
        .bind(rateKey)
        .first<{ attempts: number }>();
      if (rate && rate.attempts > 20)
        return json(
          {
            message:
              "Terlalu banyak percobaan login. Coba kembali dalam 15 menit.",
          },
          429,
        );

      const user = await env.DB.prepare(
        "SELECT * FROM users WHERE username = ?",
      )
        // Username selalu disimpan dengan huruf kecil, jadi "Mimin" dan
        // "mimin" dianggap sama.
        .bind(body.username.trim().toLowerCase())
        .first<UserRow>();

      // Tetap lakukan hashing meskipun username tidak ditemukan.
      const hash = await hashPassword(
        body.password,
        user?.password_salt ?? "00000000000000000000000000000000",
      );

      if (!user || !hashesMatch(hash, user.password_hash)) {
        return json({ message: "Username atau password salah." }, 401);
      }

      if (user.aktif !== 1) {
        return json(
          { message: "Akun ini sudah dinonaktifkan. Hubungi admin." },
          403,
        );
      }

      await env.DB.prepare("DELETE FROM login_attempts WHERE key=?")
        .bind(rateKey)
        .run();
      const previousSession = getSessionId(request);

      if (previousSession) {
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
          .bind(previousSession)
          .run();
      }

      const sessionId = crypto.randomUUID();
      const maxAge = 60 * 60 * 8;
      const expiresAt = Date.now() + maxAge * 1000;

      await env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      )
        .bind(sessionId, user.id, expiresAt)
        .run();

      return json(
        {
          user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            peran: user.peran,
          },
        },
        200,
        { "Set-Cookie": sessionCookie(request, sessionId, maxAge) },
      );
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      const sessionId = getSessionId(request);

      if (!sessionId) {
        return json({ message: "Silakan login terlebih dahulu." }, 401);
      }

      const user = await penggunaSesi(env, sessionId);

      if (!user) {
        return json({ message: "Sesi berakhir. Silakan login kembali." }, 401, {
          "Set-Cookie": sessionCookie(request, "", 0),
        });
      }

      return json({ user });
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      const sessionId = getSessionId(request);

      if (sessionId) {
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
          .bind(sessionId)
          .run();
      }

      return json({ message: "Berhasil keluar." }, 200, {
        "Set-Cookie": sessionCookie(request, "", 0),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const sessionId = getSessionId(request);
      const user = sessionId ? await penggunaSesi(env, sessionId) : null;
      if (!user)
        return json({ message: "Silakan login terlebih dahulu." }, 401);
      try {
        const isPengguna =
          url.pathname === "/api/password" ||
          url.pathname === "/api/users" ||
          url.pathname.startsWith("/api/users/");
        return json(
          isPengguna
            ? await pengguna(request, env, user, sessionId!)
            : await domain(request, env, user),
        );
      } catch (error) {
        if (error instanceof ApiError)
          return json({ message: error.message }, error.status);
        const message = error instanceof Error ? error.message : "";
        if (message.includes("UNIQUE constraint"))
          return json(
            {
              message:
                "Data sudah ada. Gunakan kode/site lain atau periksa tiket yang sudah dibuat.",
            },
            409,
          );
        console.error("API failure", error);
        return json(
          { message: "Proses gagal. Periksa data dan konfigurasi database." },
          500,
        );
      }
    }
    return json({ message: "Halaman API tidak ditemukan." }, 404);
  },
} satisfies ExportedHandler<Env>;
