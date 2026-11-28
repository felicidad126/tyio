import assert from "node:assert/strict";
import { createInterface } from "node:readline/promises";
import { bulanWIB } from "../shared/waktu.ts";

// Run only against a disposable LOCAL database. This creates labelled QA records.
const base = process.env.TEST_BASE_URL ?? "http://localhost:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("Integration tests may only run against localhost.");
}
const suffix = Date.now().toString(36);
let cookie = "";
let checks = 0;

// Uji memakai akun admin yang dibuat saat `npm run setup`. Isi lewat
// TEST_USERNAME dan TEST_PASSWORD, atau ketik saat diminta.
let adminUsername = process.env.TEST_USERNAME;
let adminPassword = process.env.TEST_PASSWORD;
if (!adminUsername || !adminPassword) {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  adminUsername ||= (await terminal.question("Username admin: ")).trim();
  adminPassword ||= await terminal.question("Password admin: ");
  terminal.close();
}

async function request(path, body, authenticated = true, jar = cookie) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: new URL(base).origin }),
      ...(authenticated && jar ? { Cookie: jar } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path}: expected JSON, received ${text.slice(0, 150)}`);
  }
  return { response, data };
}

function check(condition, description) {
  assert.ok(condition, description);
  checks++;
  console.log(`PASS ${description}`);
}

async function post(path, body) {
  const result = await request(path, body);
  assert.ok(
    result.response.ok,
    `${path}: ${result.response.status} ${JSON.stringify(result.data)}`,
  );
  return result.data;
}

async function get(path) {
  const result = await request(path);
  assert.ok(result.response.ok, `${path}: ${JSON.stringify(result.data)}`);
  return result.data;
}
const nprDetail = (id) => get(`/api/nprs/${id}`);

check(
  bulanWIB("2026-11-30T16:59:00Z") === "2026-11" &&
    bulanWIB("2026-11-30T17:30:00Z") === "2026-12",
  "month is determined in WIB (00.30 WIB on the 1st belongs to the new month)",
);

const unauthorized = await request("/api/master", undefined, false);
check(
  unauthorized.response.status === 401,
  "protected data rejects anonymous access",
);

const incorrect = await request(
  "/api/login",
  { username: adminUsername, password: "incorrect-qa-password" },
  false,
);
check(incorrect.response.status === 401, "incorrect password rejected");

const login = await request(
  "/api/login",
  {
    username: adminUsername,
    password: adminPassword,
  },
  false,
);
assert.ok(login.response.ok, `Login failed: ${JSON.stringify(login.data)}`);
cookie = login.response.headers.get("set-cookie")?.split(";")[0] ?? "";
check(
  Boolean(cookie) && login.data.user?.peran === "admin",
  "valid admin account receives session cookie and role",
);
check(
  (await request("/api/me")).response.ok,
  "session survives independent API request",
);

const csrf = await fetch(`${base}/api/customers`, {
  method: "POST",
  headers: {
    Cookie: cookie,
    Origin: "https://untrusted.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "Should not exist", code: "BAD" }),
});
check(csrf.status === 403, "cross-origin write rejected");

await post("/api/customers", { name: `QA Bank ${suffix}`, code: `Q${suffix}` });
let data = await get("/api/master");
const customer = data.customers.find(
  (row) => row.code === `Q${suffix}`.toUpperCase(),
);
assert.ok(customer, "created customer appears in data");

const remotes = [];
for (const [index, jarkom] of ["VSAT", "M2M"].entries()) {
  const site_id = `QA-${suffix}-${index}`;
  await post("/api/remotes", {
    customer_id: customer.id,
    site_id,
    location: `ATM QA ${index}`,
    address: "Alamat fiktif QA",
    city: "Bekasi",
    province: "Jawa Barat",
    jarkom,
    ip_lan: `192.0.2.${index + 10}`,
    pic_name: "PIC Simulasi QA",
    pic_phone: "08000000000",
  });
  data = await get("/api/master");
  remotes.push(data.remotes.find((row) => row.site_id === site_id));
}
check(remotes.every(Boolean), "customer can have both VSAT and M2M sites");

const period = new Date();
period.setUTCMonth(period.getUTCMonth() - 1, 10);
period.setUTCHours(8, 0, 0, 0);
const at = (hours) =>
  new Date(period.getTime() + hours * 3600000).toISOString();
const month = at(0).slice(0, 7);

async function newNpr(remote, status, offset = 0) {
  const notes = `QA ${suffix} ${status} ${offset}`;
  const created = await post("/api/nprs", {
    remote_id: remote.id,
    remote_status: status,
    started_at: at(offset),
    notes,
  });
  const found = (await nprDetail(created.id)).npr;
  assert.ok(found);
  return found;
}

async function action(npr, kind, offset, extra = {}) {
  return post(`/api/nprs/${npr.id}/actions`, {
    kind,
    notes: `QA ${kind}`,
    remote_status: npr.remote_status,
    pending_by: "Customer",
    occurred_at: at(offset),
    ...extra,
  });
}

const customerNpr = await newNpr(remotes[0], "ATM Offline");
const prefix = (jenis) =>
  `${jenis}/${bulanWIB().slice(0, 4)}/${bulanWIB().slice(5, 7)}/`;
check(
  new RegExp(`^${prefix("NPR")}\\d{4}$`).test(customerNpr.number),
  "NPR number is sequential per WIB month of input (NPR/YYYY/MM/0001)",
);
check(customerNpr.pending_by === "TM", "new NPR starts as Pending TM");
const unknownCategory = await request(`/api/nprs/${customerNpr.id}/actions`, {
  kind: "Problem",
  notes: "Unknown category",
  remote_status: customerNpr.remote_status,
  pending_by: "Belum",
  occurred_at: at(0.2),
});
check(
  !unknownCategory.response.ok,
  "pending category other than TM or Customer is rejected",
);
const emptyCategory = await request(`/api/nprs/${customerNpr.id}/actions`, {
  kind: "Problem",
  notes: "Empty category",
  remote_status: customerNpr.remote_status,
  pending_by: "",
  occurred_at: at(0.25),
});
check(
  emptyCategory.response.ok &&
    (await nprDetail(customerNpr.id)).npr.pending_by === "TM",
  "empty pending category keeps the NPR's current category",
);
await action(customerNpr, "Problem", 0.5);
await action(customerNpr, "Close", 1, { online_at: at(1) });
check(
  (await nprDetail(customerNpr.id)).npr.status === "CLOSED",
  "customer NPR closes without technician ticket",
);

const maintenance = await newNpr(remotes[0], "Remote Down", 2);
check(
  Number(maintenance.number.slice(-4)) ===
    Number(customerNpr.number.slice(-4)) + 1,
  "consecutive NPRs receive consecutive numbers",
);
await action(maintenance, "Eskalasi Service", 3, {
  pending_by: "TM",
  instruction: "Maintenance",
});
const duplicate = await request(`/api/nprs/${maintenance.id}/actions`, {
  kind: "Eskalasi Service",
  notes: "duplicate QA",
  remote_status: "Remote Down",
  pending_by: "TM",
  occurred_at: at(3),
  instruction: "Maintenance",
});
check(!duplicate.response.ok, "duplicate technician ticket rejected");

const premature = await request(`/api/nprs/${maintenance.id}/actions`, {
  kind: "Close",
  notes: "premature close",
  remote_status: "Remote Down",
  pending_by: "TM",
  occurred_at: at(6),
  online_at: at(6),
});
check(!premature.response.ok, "ticket cannot close before technician report");
await action(maintenance, "Problem", 4, {
  pending_by: "Customer",
  notes: "Menunggu akses lokasi dari customer.",
});
data = await nprDetail(maintenance.id);
check(
  data.npr.status === "ESKALASI",
  "NPR stays ESKALASI after a Problem action while its TT is open",
);
check(
  new RegExp(`^${prefix("TT")}\\d{4}$`).test(data.ticket?.number),
  "TT number is sequential per WIB month (TT/YYYY/MM/0001)",
);
await action(maintenance, "Problem", 5, {
  pending_by: "TM",
  notes: "Akses tersedia; perbaikan jaringan dilanjutkan.",
});
await action(maintenance, "Report Teknisi", 6, {
  pending_by: "TM",
  technician: "Teknisi QA",
  notes: "Modem diganti; jaringan normal.",
});
await action(maintenance, "Close", 7, { pending_by: "TM", online_at: at(6) });
data = await nprDetail(maintenance.id);
const closed = data.npr;
check(
  closed?.status === "CLOSED" &&
    Date.parse(closed.online_at) === Date.parse(at(6)),
  "actual restoration time retained independently of administrative close",
);
check(
  (await get("/api/tickets?cari=" + encodeURIComponent(data.ticket.number)))
    .rows.length === 1,
  "one TT remains linked to its NPR",
);

const pm = await newNpr(remotes[1], "Preventive Maintenance", 2);
await action(pm, "Eskalasi Service", 3, {
  pending_by: "TM",
  instruction: "Preventive Maintenance",
});
await action(pm, "Report Teknisi", 5, {
  pending_by: "TM",
  technician: "Teknisi QA",
  notes: "Perawatan selesai tanpa downtime.",
});
await action(pm, "Close", 6, { pending_by: "TM", online_at: at(5) });
let sla = await request(`/api/sla?month=${month}`);
assert.ok(sla.response.ok, JSON.stringify(sla.data));
const pmSla = sla.data.rows.find((row) => row.remote_id === remotes[1].id);
check(
  pmSla?.downtime_minutes === 0 && pmSla.sla === 100,
  "preventive maintenance has no SLA downtime",
);
const tmSla = sla.data.rows.find((row) => row.remote_id === remotes[0].id);
check(
  tmSla?.downtime_minutes > 0 && tmSla.sla < 100,
  "maintenance downtime affects site SLA",
);
check(
  tmSla?.downtime_minutes === 180,
  "SLA excludes customer-responsibility interval and stops at actual restoration",
);
const daysInMonth = new Date(
  Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0),
).getUTCDate();
check(
  tmSla.total_minutes === daysInMonth * 24 * 60,
  "SLA denominator includes every calendar day of the month in WIB",
);
const closedEdit = await request(`/api/nprs/${maintenance.id}/actions`, {
  kind: "Problem",
  notes: "Forbidden modification",
  pending_by: "TM",
  occurred_at: at(8),
});
check(!closedEdit.response.ok, "closed NPR history is immutable");

const gamasBaru = await post("/api/gamas", {
  location: "Data Center QA",
  notes: `Gangguan massal QA ${suffix}`,
  remote_ids: remotes.map((row) => row.id),
  started_at: at(4),
});
data = await get(`/api/gamas/${gamasBaru.id}`);
const gamas = data.gamas;
assert.ok(gamas);
check(
  new RegExp(`^${prefix("GAMAS")}\\d{4}$`).test(gamas.number) &&
    data.sites.length === 2,
  "Gamas receives a sequential number and its affected sites",
);
const earlyGamas = await request(`/api/gamas/${gamas.id}/actions`, {
  notes: "Premature",
  close: true,
  online_at: at(8),
});
check(!earlyGamas.response.ok, "Gamas close requires technician report");
await post(`/api/gamas/${gamas.id}/actions`, {
  notes: "Kunjungan selesai",
  report: "Perbaikan HUB selesai, seluruh site normal.",
  occurred_at: at(7),
});
const gamasWithoutOnline = await request(`/api/gamas/${gamas.id}/actions`, {
  notes: "Tutup tanpa jam online",
  close: true,
  occurred_at: at(9),
});
check(
  !gamasWithoutOnline.response.ok,
  "Gamas cannot close without restoration time",
);
const gamasBackdated = await request(`/api/gamas/${gamas.id}/actions`, {
  notes: "Mundur",
  occurred_at: at(5),
});
check(
  !gamasBackdated.response.ok,
  "Gamas progress cannot precede the latest recorded progress",
);
await post(`/api/gamas/${gamas.id}/actions`, {
  notes: "Konfirmasi normal",
  close: true,
  occurred_at: at(9),
  online_at: at(8),
});
sla = await request(`/api/sla?month=${month}`);
const afterGamas = sla.data.rows.find((row) => row.remote_id === remotes[0].id);
const secondSite = sla.data.rows.find((row) => row.remote_id === remotes[1].id);
check(
  secondSite?.downtime_minutes === 240,
  "Gamas downtime counted for each affected site",
);
check(
  afterGamas?.downtime_minutes < tmSla.downtime_minutes + 240,
  "overlapping Gamas and TT downtime is not double-counted",
);

// Data diambil per halaman (K-01)
const tiny =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const withFile = await newNpr(remotes[1], "ATM Offline", 10);
await action(withFile, "Problem", 10.5, {
  attachment_name: "bukti.png",
  attachment_data: tiny,
});
const fileDetail = await nprDetail(withFile.id);
const fileAction = fileDetail.actions.find((row) => row.kind === "Problem");
check(
  fileAction?.attachment_name === "bukti.png" &&
    !("attachment_data" in fileAction),
  "NPR detail lists attachment names without their content",
);
check(
  (await get(`/api/lampiran/${fileAction.id}`)).data === tiny,
  "attachment content is fetched separately when opened",
);
const page1 = await get("/api/nprs?per=1&halaman=1");
check(
  page1.rows.length === 1 && page1.total > 1,
  "NPR list is paginated on the server",
);
check(
  !page1.rows.some((row) => "attachment_data" in row),
  "NPR list never carries attachment content",
);
const found = await get(
  `/api/nprs?cari=${encodeURIComponent(withFile.number)}`,
);
check(
  found.total === 1 && found.rows[0].id === withFile.id,
  "NPR list searches by number",
);
const active = await get("/api/nprs?kondisi=aktif&per=100");
check(
  active.rows.some((row) => row.id === withFile.id) &&
    active.rows.every((row) => row.status !== "CLOSED"),
  "NPR list filters active NPRs for the dashboard",
);
const statusActive = await get("/api/nprs?status=AKTIF&per=100");
check(
  statusActive.total === active.total &&
    statusActive.rows.every((row) => row.status !== "CLOSED"),
  "status filter AKTIF lists every NPR that is not closed",
);
const dashboard = await get("/api/dashboard");
check(
  dashboard.grafik.length === 7 &&
    dashboard.ringkas.aktif === active.total &&
    dashboard.npr_terlama.length <= 10,
  "dashboard summary matches the filtered NPR list",
);

// Akun per orang
async function loginAs(username, password) {
  const result = await request("/api/login", { username, password }, false);
  return {
    result,
    jar: result.response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
const staffUsername = `qa-${suffix}`;
const staffPassword = "QaHelpdesk-12345";
await post("/api/users", {
  username: staffUsername,
  full_name: `Helpdesk QA ${suffix}`,
  peran: "helpdesk",
  password: staffPassword,
});
const weak = await request("/api/users", {
  username: `qb-${suffix}`,
  full_name: "Password pendek",
  peran: "helpdesk",
  password: "pendek",
});
check(!weak.response.ok, "new account requires a password of 12+ characters");
const users = (await request("/api/users")).data.users;
const staff = users.find((row) => row.username === staffUsername);
check(
  staff?.peran === "helpdesk" && staff.aktif === 1,
  "admin creates a helpdesk account",
);
check(
  !users.some((row) => "password_hash" in row),
  "user list never exposes password hashes",
);

const staffLogin = await loginAs(staffUsername, staffPassword);
check(staffLogin.result.response.ok, "new helpdesk account can log in");
const staffJar = staffLogin.jar;
const forbidden = await request("/api/users", undefined, true, staffJar);
check(
  forbidden.response.status === 403,
  "helpdesk cannot open the user management API",
);
const staffNpr = await request(
  "/api/nprs",
  {
    remote_id: remotes[0].id,
    remote_status: "Remote Down",
    started_at: new Date(Date.now() - 600000).toISOString(),
    notes: `Dicatat helpdesk QA ${suffix}`,
  },
  true,
  staffJar,
);
check(
  (await nprDetail(staffNpr.data.id)).npr.created_by ===
    `Helpdesk QA ${suffix}`,
  "NPR records the account that created it",
);
const wrongOld = await request(
  "/api/password",
  { old_password: "bukan-password-lama", new_password: "PasswordBaru-123" },
  true,
  staffJar,
);
check(!wrongOld.response.ok, "password change requires the current password");
const changed = await request(
  "/api/password",
  { old_password: staffPassword, new_password: "PasswordBaru-123" },
  true,
  staffJar,
);
check(changed.response.ok, "helpdesk can change own password");
check(
  !(await loginAs(staffUsername, staffPassword)).result.response.ok &&
    (await loginAs(staffUsername, "PasswordBaru-123")).result.response.ok,
  "old password stops working after a change",
);
const selfDisable = await request(`/api/users/${login.data.user.id}`, {
  full_name: login.data.user.full_name,
  peran: "admin",
  aktif: false,
});
check(!selfDisable.response.ok, "admin cannot deactivate own account");
await post(`/api/users/${staff.id}`, {
  full_name: staff.full_name,
  peran: "helpdesk",
  aktif: false,
});
check(
  (await request("/api/me", undefined, true, staffJar)).response.status === 401,
  "deactivated account loses its active session",
);
check(
  (await loginAs(staffUsername, "PasswordBaru-123")).result.response.status ===
    403,
  "deactivated account cannot log in",
);

await post("/api/logout", {});
check(
  (await request("/api/master")).response.status === 401,
  "logout invalidates server session",
);
console.log(
  `\n${checks} integration checks passed. QA records use suffix ${suffix}.`,
);
