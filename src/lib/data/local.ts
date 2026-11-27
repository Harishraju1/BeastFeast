/**
 * Local backend: everything is stored in this browser (localStorage).
 * Used automatically when Supabase environment variables are not configured.
 * Passwords are salted SHA-256 hashes; this mode is for workshops on a single device and is NOT tamper-proof —
 * configure Supabase for cross-device accounts, server-side XP validation and a campus-wide leaderboard.
 */
import type { Profile, Project } from "@/lib/types";
import type { TrackDef } from "@/lib/sim/types";
import { type AdminContent, type Backend, DEFAULT_RULES, type LearningActivityKind, type Progress, type QuizAttempt, type RoleAuditEntry, type StaffAccount, type XpConfig, type XpEvent, type XpEventType, LEADERBOARD_MIN_XP, type RankEvent, defaultXpConfig, sourceOf, type SignUpInput, type PrivateDetails, type AdminUserQuery, type AdminUserRow, type NiatReviewRow } from "./types";
import { blobToDataUrl, squareImage } from "@/lib/avatar-client";
import { AVATAR_MAX_BYTES, NIAT_ID_RE, avatarFileError, campusError, mobileError, niatIdError, normalizeCampus, normalizeNiatId, toE164India } from "@/lib/validation";
import { computeStreak } from "@/lib/streak";
import { type UploadOptions, UploadCancelled, storageName } from "@/lib/video/upload";
import type { Video } from "./types";

/** Local mode keeps uploaded videos in this browser's IndexedDB (localStorage is far too small). */
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("bf5-videos", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("This browser cannot store videos (IndexedDB unavailable)."));
  });
}
async function idbPut(key: string, value: Blob) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction("files", "readwrite");
    t.objectStore("files").put(value, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error ?? new Error("Could not store the video in this browser (storage full?)."));
  });
}
async function idbGet(key: string): Promise<Blob | null> {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction("files").objectStore("files").get(key);
    r.onsuccess = () => res((r.result as Blob | undefined) ?? null);
    r.onerror = () => rej(r.error);
  });
}
async function idbDelete(key: string) {
  const db = await idb();
  await new Promise<void>((res) => {
    const t = db.transaction("files", "readwrite");
    t.objectStore("files").delete(key);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}
import { levelForXp } from "@/lib/ranks";
import { isStaff, isSuperAdmin } from "@/lib/roles";
import { gradeQuiz } from "./grading";

const K = {
  accounts: "bf5.accounts",
  session: "bf5.session",
  projects: "bf5.projects",
  tracks: "bf5.tracks",
  progress: (u: string) => `bf5.progress.${u}`,
  xp: "bf5.xp",
  content: "bf5.content",
  roleAudit: "bf5.roleAudit",
  activity: "bf5.activity",
  ranks: "bf5.rankHistory",
};

/** Start of the current XP day: the most recent 11:15 PM in Asia/Kolkata (UTC+5:30, no DST) = 17:45 UTC. */
export function xpPeriodStart(now: Date = new Date()): Date {
  const b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 45));
  if (b.getTime() > now.getTime()) b.setUTCDate(b.getUTCDate() - 1);
  return b;
}

interface ActivityRow {
  userId: string;
  day: string;
  kind: LearningActivityKind;
  ref: string;
}

/** Calendar day (YYYY-MM-DD) in the configured time zone. */
function dayIn(tz: string, d: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

interface Account {
  profile: Profile;
  email: string;
  salt: string;
  hash: string;
  /** private details (never shown to other students) */
  phone?: string | null;
  niatId?: string | null;
  legacyStudentId?: string | null;
}

/** Resize to a 256 × 256 WebP data URL (local mode stores pictures in browser storage). */
async function resizeAvatar(file: Blob): Promise<string> {
  return blobToDataUrl(await squareImage(file, 256));
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch (e) {
    console.error("Local storage write failed", e);
    throw new Error("Could not save — browser storage is full or blocked.");
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const rid = (p: string) => `${p}_${crypto.randomUUID().slice(0, 12)}`;

/**
 * Serialises every XP-ledger change in this browser so a duplicate check and its write can never interleave:
 * Web Locks across tabs, plus a promise chain inside this tab (also used where Web Locks are unavailable).
 * Without it, two overlapping submissions both passed the "already awarded?" check and both reported the XP.
 */
let xpChain: Promise<unknown> = Promise.resolve();
function withXpLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  const run = locks?.request ? () => locks.request("bf5.xp-ledger", fn) as Promise<T> : fn;
  const next = xpChain.then(run, run);
  xpChain = next.catch(() => undefined);
  return next;
}

export const EMPTY_CONTENT: AdminContent = {
  videos: [], announcements: [], missions: null, rules: DEFAULT_RULES, componentOverrides: {}, addedComponents: [], featuredProjects: [], topicOverrides: {}, extraQuestions: [],
};

export class LocalBackend implements Backend {
  readonly mode = "local" as const;

  private accounts(): Account[] {
    const accounts = read<Account[]>(K.accounts, []);
    // devices set up before roles existed: the first account (the old device admin) becomes Super Admin
    if (accounts.length && !accounts.some((a) => a.profile.role === "super_admin") && accounts[0].profile.role === "admin") {
      accounts[0].profile.role = "super_admin";
      write(K.accounts, accounts);
    }
    return accounts;
  }

  async currentUser() {
    const id = read<string | null>(K.session, null);
    return this.accounts().find((a) => a.profile.id === id)?.profile ?? null;
  }

  async signUp(input: SignUpInput) {
    const accounts = this.accounts();
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password || input.password.length < 6) throw new Error("Enter an email and a password of at least 6 characters.");
    if (!input.name.trim()) throw new Error("Enter your name.");
    const niatErr = niatIdError(input.niatId);
    if (niatErr) throw new Error(niatErr);
    const phoneErr = mobileError(input.phone);
    if (phoneErr) throw new Error(phoneErr);
    const campusErr = campusError(input.campus ?? "");
    if (campusErr) throw new Error(campusErr);
    const niatId = normalizeNiatId(input.niatId);
    if (accounts.some((a) => a.email === email)) throw new Error("An account with this email already exists on this device.");
    if (accounts.some((a) => a.niatId === niatId)) throw new Error("This NIAT ID is already registered.");
    const salt = crypto.randomUUID();
    const profile: Profile = {
      id: rid("u"), name: input.name.trim(), campus: normalizeCampus(input.campus), studentId: "", avatar: null,
      role: accounts.length === 0 ? "super_admin" : "student", // the first account on a device is its Super Admin
      xp: 0, createdAt: new Date().toISOString(),
    };
    accounts.push({ profile, email, salt, hash: await sha256(salt + input.password), phone: toE164India(input.phone), niatId, legacyStudentId: null });
    write(K.accounts, accounts);
    write(K.session, profile.id);
    return profile;
  }

  async signIn(email: string, password: string) {
    const a = this.accounts().find((x) => x.email === email.trim().toLowerCase());
    if (!a || (await sha256(a.salt + password)) !== a.hash) throw new Error("Email or password is incorrect.");
    write(K.session, a.profile.id);
    return a.profile;
  }

  async signOut() {
    localStorage.removeItem(K.session);
  }
  async requestPasswordReset(): Promise<void> {
    throw new Error("Local mode has no email service. Ask this device's Super Admin, or create a new local account.");
  }
  async resendConfirmation(): Promise<void> {
    throw new Error("Local mode accounts do not need email confirmation.");
  }
  async signInWithGoogle(): Promise<void> {
    throw new Error("Google sign-in is only available in cloud mode.");
  }
  async updatePassword(newPassword: string) {
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === this.me().profile.id)!;
    a.salt = crypto.randomUUID();
    a.hash = await sha256(a.salt + newPassword);
    write(K.accounts, accounts);
  }
  async hasRecoverySession() {
    return !!(await this.currentUser());
  }

  async updateProfile(p: Partial<Profile> & { id: string }) {
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === p.id);
    if (!a) throw new Error("Profile not found");
    const { role: _role, xp: _xp, studentId: _sid, avatar: _av, ...safe } = p; // role, XP, IDs and the picture are not edited here
    void _role;
    void _xp;
    void _sid;
    void _av;
    if (safe.campus !== undefined && normalizeCampus(safe.campus) !== a.profile.campus) {
      const e = campusError(safe.campus);
      if (e) throw new Error(e);
      safe.campus = normalizeCampus(safe.campus);
    }
    a.profile = { ...a.profile, ...safe };
    write(K.accounts, accounts);
    return a.profile;
  }

  async listProfiles() {
    return this.accounts().map((a) => a.profile);
  }

  private me(): Account {
    const id = read<string | null>(K.session, null);
    const a = this.accounts().find((x) => x.profile.id === id);
    if (!a) throw new Error("Your session has expired. Please sign in again.");
    return a;
  }
  private details(a: Account): PrivateDetails {
    // accounts made before NIAT IDs were required keep their old ID as a legacy ID
    const legacy = a.legacyStudentId ?? (a.profile.studentId || null);
    return { email: a.email, phone: a.phone ?? null, niatId: a.niatId ?? (legacy && NIAT_ID_RE.test(normalizeNiatId(legacy)) ? normalizeNiatId(legacy) : null), legacyStudentId: legacy };
  }
  async getMyDetails() {
    try {
      return this.details(this.me());
    } catch {
      return { email: null, phone: null, niatId: null, legacyStudentId: null };
    }
  }
  async completeMyDetails(input: { niatId?: string; phone?: string }) {
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === this.me().profile.id)!;
    const cur = this.details(a);
    if (input.niatId) {
      const v = normalizeNiatId(input.niatId);
      if (cur.niatId && cur.niatId !== v) throw new Error("Your NIAT ID is already set. Ask an administrator if it is wrong.");
      const e = niatIdError(v);
      if (e) throw new Error(e);
      if (accounts.some((x) => x !== a && this.details(x).niatId === v)) throw new Error("This NIAT ID is already registered.");
      a.niatId = v;
    }
    if (input.phone) {
      const e = mobileError(input.phone);
      if (e) throw new Error(e);
      a.phone = toE164India(input.phone);
    }
    write(K.accounts, accounts);
    return this.details(a);
  }
  async niatIdAvailable(niatId: string) {
    const v = normalizeNiatId(niatId);
    return NIAT_ID_RE.test(v) && !this.accounts().some((a) => this.details(a).niatId === v);
  }
  async setAvatar(file: Blob) {
    if (file.size > AVATAR_MAX_BYTES) throw new Error("The picture must be 5 MB or smaller.");
    const err = await avatarFileError(file as File);
    if (err) throw new Error(err);
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === this.me().profile.id)!;
    a.profile = { ...a.profile, avatar: await resizeAvatar(file) };
    write(K.accounts, accounts);
    return a.profile;
  }
  async removeAvatar() {
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === this.me().profile.id)!;
    a.profile = { ...a.profile, avatar: null };
    write(K.accounts, accounts);
    return a.profile;
  }
  async adminListUsers(q: AdminUserQuery) {
    const me = this.me();
    if (me.profile.role !== "admin" && me.profile.role !== "super_admin") throw new Error("Administrator access required");
    const s = (q.search ?? "").trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    const all = this.accounts()
      .map((a): AdminUserRow => {
        const d = this.details(a);
        return {
          id: a.profile.id, name: a.profile.name, email: a.email, phone: d.phone, niatId: d.niatId, legacyStudentId: d.legacyStudentId, avatar: a.profile.avatar,
          role: a.profile.role, xp: a.profile.xp, dailyXp: a.profile.dailyXp ?? 0, rankLevel: Math.max(a.profile.rankLevel ?? 1, levelForXp(a.profile.xp)),
          createdAt: a.profile.createdAt, lastSignInAt: null, status: "active", campus: a.profile.campus ?? "",
        };
      })
      .filter((r) => { const c = (q.campus ?? "").trim().toLowerCase(); return !c || (c === "(none)" ? !r.campus : r.campus.toLowerCase().includes(c)); })
      .filter((r) => !s || r.name.toLowerCase().includes(s) || r.email.includes(s) || r.campus.toLowerCase().includes(s) || (r.niatId ?? "").toLowerCase().includes(s) || (r.legacyStudentId ?? "").toLowerCase().includes(s) || (!!digits && (r.phone ?? "").includes(digits)))
      .filter((r) => (!q.role || r.role === q.role) && (!q.status || r.status === q.status) && (q.minRank == null || r.rankLevel >= q.minRank) && (q.maxRank == null || r.rankLevel <= q.maxRank))
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    return { total: all.length, rows: all.slice(q.offset, q.offset + q.limit) };
  }

  private requireAdmin() {
    const me = this.me();
    if (me.profile.role !== "admin" && me.profile.role !== "super_admin") throw new Error("Administrator access required");
  }
  async adminSetCampus(userId: string, campus: string) {
    this.requireAdmin();
    const e = campusError(campus);
    if (e) throw new Error(e);
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === userId);
    if (!a) throw new Error("No such account");
    a.profile = { ...a.profile, campus: normalizeCampus(campus) };
    write(K.accounts, accounts);
    return a.profile.campus;
  }
  async adminSetNiat(userId: string, niatId: string) {
    this.requireAdmin();
    const v = normalizeNiatId(niatId);
    const e = niatIdError(v);
    if (e) throw new Error(e);
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === userId);
    if (!a) throw new Error("No such account");
    if (accounts.some((x) => x !== a && this.details(x).niatId === v)) throw new Error("This NIAT ID is already registered to another account.");
    a.niatId = v;
    write(K.accounts, accounts);
    return v;
  }
  async adminNiatReview(): Promise<NiatReviewRow[]> {
    this.requireAdmin();
    const accounts = this.accounts();
    return accounts
      .filter((a) => a.profile.role === "student")
      .map((a) => ({ a, d: this.details(a) }))
      .filter(({ a, d }) => !d.niatId || !a.profile.campus)
      .map(({ a, d }): NiatReviewRow => {
        const legacy = d.legacyStudentId ? normalizeNiatId(d.legacyStudentId) : "";
        const issue: NiatReviewRow["issue"] = d.niatId ? "campus-missing" : !legacy ? "missing" : !NIAT_ID_RE.test(legacy) ? "legacy-invalid" : accounts.some((x) => x !== a && this.details(x).niatId === legacy) ? "legacy-duplicate" : "legacy-unclaimed";
        return { id: a.profile.id, name: a.profile.name, email: a.email, campus: a.profile.campus ?? "", niatId: d.niatId, legacyStudentId: d.legacyStudentId, issue, createdAt: a.profile.createdAt };
      });
  }
  async adminCampuses() {
    this.requireAdmin();
    const m = new Map<string, number>();
    for (const a of this.accounts()) m.set(a.profile.campus || "(none)", (m.get(a.profile.campus || "(none)") ?? 0) + 1);
    return [...m].map(([campus, students]) => ({ campus, students })).sort((x, y) => y.students - x.students || x.campus.localeCompare(y.campus));
  }
  async myStreak() {
    const me = await this.currentUser();
    if (!me) return null;
    return computeStreak(await this.listXpEvents(me.id));
  }

  // Same rules as the Supabase admin_set_role() function (local mode is single-device and not tamper-proof).
  async setRole(userId: string, role: "student" | "admin", note?: string) {
    const me = await this.currentUser();
    if (!isSuperAdmin(me?.role)) throw new Error("Only the Super Admin can change roles");
    if (role !== "student" && role !== "admin") throw new Error("Role must be student or admin");
    if (userId === me!.id) throw new Error("You cannot change your own role");
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === userId);
    if (!a) throw new Error("No account with that id");
    if (a.profile.role === "super_admin") throw new Error("The Super Admin account is protected");
    if (a.profile.role === role) return;
    const entry: RoleAuditEntry = { id: rid("ra"), at: new Date().toISOString(), actorEmail: accounts.find((x) => x.profile.id === me!.id)?.email ?? null, targetEmail: a.email, oldRole: a.profile.role, newRole: role, action: role === "admin" ? "promote" : "revoke", note: note ?? null };
    a.profile.role = role;
    write(K.accounts, accounts);
    write(K.roleAudit, [entry, ...read<RoleAuditEntry[]>(K.roleAudit, [])]);
  }

  async findUserByEmail(email: string): Promise<StaffAccount | null> {
    const me = await this.currentUser();
    if (!isSuperAdmin(me?.role)) throw new Error("Only the Super Admin can look up accounts");
    const a = this.accounts().find((x) => x.email === email.trim().toLowerCase());
    return a ? { id: a.profile.id, name: a.profile.name, email: a.email, role: a.profile.role, createdAt: a.profile.createdAt } : null;
  }

  async listStaff(): Promise<StaffAccount[]> {
    const me = await this.currentUser();
    if (!isStaff(me?.role)) throw new Error("Administrator access required");
    return this.accounts()
      .filter((a) => isStaff(a.profile.role))
      .map((a) => ({ id: a.profile.id, name: a.profile.name, email: a.email, role: a.profile.role, createdAt: a.profile.createdAt }));
  }

  async listRoleAudit(): Promise<RoleAuditEntry[]> {
    const me = await this.currentUser();
    if (!isStaff(me?.role)) throw new Error("Administrator access required");
    return read<RoleAuditEntry[]>(K.roleAudit, []);
  }

  async listProjects(ownerId: string) {
    return read<Project[]>(K.projects, []).filter((p) => p.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async listAllProjects() {
    return read<Project[]>(K.projects, []);
  }
  async saveProject(p: Project) {
    const me = await this.currentUser();
    if (!me || me.id !== p.ownerId) throw new Error("You can only save your own projects.");
    const all = read<Project[]>(K.projects, []).filter((x) => x.id !== p.id);
    all.push(p);
    write(K.projects, all);
  }
  async deleteProject(id: string) {
    const me = await this.currentUser();
    const all = read<Project[]>(K.projects, []);
    const p = all.find((x) => x.id === id);
    if (p && me && (p.ownerId === me.id || isStaff(me.role))) write(K.projects, all.filter((x) => x.id !== id));
  }

  async listTracks(ownerId: string | null) {
    return read<TrackDef[]>(K.tracks, []).filter((t) => ownerId === null || t.ownerId === ownerId);
  }
  async saveTrack(t: TrackDef) {
    const all = read<TrackDef[]>(K.tracks, []).filter((x) => x.id !== t.id);
    all.push(t);
    write(K.tracks, all);
  }
  async deleteTrack(id: string) {
    write(K.tracks, read<TrackDef[]>(K.tracks, []).filter((x) => x.id !== id));
  }

  async getProgress(userId: string): Promise<Progress> {
    return read<Progress>(K.progress(userId), { userId, completedTopics: [], bookmarks: [], lastTopic: null, correctQuestions: [], quizAttempts: [], watchedVideos: [], records: {} });
  }
  async saveProgress(p: Progress) {
    write(K.progress(p.userId), p);
  }

  async awardXp(userId: string, type: XpEventType, refId: string, amount?: number, description?: string) {
    return withXpLock(() => this.awardUnlocked(userId, type, refId, amount, description));
  }

  /** Caller must hold the XP lock. Idempotent per (user, type, refId) — the same rule as the database. */
  private async awardUnlocked(userId: string, type: XpEventType, refId: string, amount?: number, description?: string, attempt?: { id: string; source: XpEvent["source"] }) {
    if (type === "inactivity-penalty") throw new Error("Penalties are applied automatically.");
    const rule = (await this.getXpConfig()).rules[type];
    const events = read<XpEvent[]>(K.xp, []); // read after every await, right before the check and the write
    const value = type === "question-correct" ? Math.max(0, Math.min(15, amount ?? 0)) : rule.amount;
    const mine = events.filter((e) => e.userId === userId);
    const dup = mine.some((e) => e.type === type && e.refId === refId);
    const overLimit = rule.limit !== null && mine.filter((e) => e.type === type).length >= rule.limit;
    let awarded = 0;
    if (!dup && !overLimit && value > 0) {
      events.push({ id: rid("xp"), userId, type, refId, amount: value, at: new Date().toISOString(), source: attempt?.source ?? sourceOf({ type, refId }), description: description ?? null, ...(attempt ? { attemptId: attempt.id } : {}) });
      write(K.xp, events);
      awarded = value;
    }
    if (type === "lesson-complete") await this.recordActivity("lesson", refId);
    return { awarded, total: this.recomputeXp(userId) };
  }

  /** Lifetime XP (≥ 0), daily XP since 11:15 PM IST and the permanent rank — same rules as the database. */
  private recomputeXp(userId: string) {
    const mine = read<XpEvent[]>(K.xp, []).filter((e) => e.userId === userId);
    const total = Math.max(0, mine.reduce((a, e) => a + e.amount, 0));
    const since = xpPeriodStart().getTime();
    const daily = Math.max(0, mine.filter((e) => Date.parse(e.at) >= since).reduce((a, e) => a + e.amount, 0));
    const accounts = this.accounts();
    const acc = accounts.find((a) => a.profile.id === userId);
    if (acc) {
      const old = acc.profile.rankLevel ?? 1;
      const lvl = levelForXp(total);
      if (lvl > old) {
        const hist = read<(RankEvent & { userId: string })[]>(K.ranks, []);
        write(K.ranks, [...hist, { id: rid("rk"), userId, oldLevel: old, newLevel: lvl, xpAt: total, at: new Date().toISOString(), seen: false, note: null }]);
      }
      acc.profile = { ...acc.profile, xp: total, dailyXp: daily, rankLevel: Math.max(old, lvl) };
      write(K.accounts, accounts);
    }
    return total;
  }

  async listLeaderboard() {
    for (const a of this.accounts()) this.recomputeXp(a.profile.id);
    return this.accounts()
      .map((a) => a.profile)
      .filter((p) => p.xp > LEADERBOARD_MIN_XP)
      .sort((a, b) => b.xp - a.xp || a.createdAt.localeCompare(b.createdAt));
  }

  async listRankHistory(userId: string): Promise<RankEvent[]> {
    return read<(RankEvent & { userId: string })[]>(K.ranks, [])
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async markRankSeen(ids: string[]) {
    const set = new Set(ids);
    write(K.ranks, read<(RankEvent & { userId: string })[]>(K.ranks, []).map((r) => (set.has(r.id) ? { ...r, seen: true } : r)));
  }

  async getXpConfig(): Promise<XpConfig> {
    const base = defaultXpConfig();
    const saved = (await this.getContent()).xpConfig;
    return saved ? { rules: { ...base.rules, ...saved.rules }, penalty: { ...base.penalty, ...saved.penalty } } : base;
  }

  async saveXpConfig(cfg: XpConfig) {
    await this.saveContent({ xpConfig: cfg }); // saveContent enforces admin access
  }

  async recordActivity(kind: LearningActivityKind, ref: string) {
    const me = await this.currentUser();
    if (!me) return;
    const { penalty } = await this.getXpConfig();
    const day = dayIn(penalty.timezone);
    const rows = read<ActivityRow[]>(K.activity, []);
    if (!rows.some((r) => r.userId === me.id && r.day === day && r.kind === kind && r.ref === ref)) write(K.activity, [...rows, { userId: me.id, day, kind, ref }]);
  }

  /** Same rules as the Supabase apply_inactivity_penalties() function. */
  async applyInactivityPenalties() {
    return withXpLock(() => this.applyPenaltiesUnlocked());
  }
  private async applyPenaltiesUnlocked() {
    const me = await this.currentUser();
    const cfg = await this.getXpConfig();
    const pen = cfg.rules["inactivity-penalty"].amount;
    if (!me || !cfg.penalty.enabled || pen <= 0 || isStaff(me.role)) return { deducted: 0, days: 0 };
    const tz = cfg.penalty.timezone;
    const today = dayIn(tz);
    const created = dayIn(tz, new Date(me.createdAt));
    const floor = addDays(today, -cfg.penalty.maxDaysBack);
    let d = [addDays(created, 1), cfg.penalty.start || today, floor].sort().pop()!;
    const activity = new Set(read<ActivityRow[]>(K.activity, []).filter((r) => r.userId === me.id).map((r) => r.day));
    const progress = await this.getProgress(me.id);
    for (const a of progress.quizAttempts) activity.add(dayIn(tz, new Date(a.at)));
    let deducted = 0;
    let days = 0;
    while (d < today) {
      const events = read<XpEvent[]>(K.xp, []);
      const mine = events.filter((e) => e.userId === me.id);
      const learned = mine.some((e) => (e.type === "lesson-complete" || e.type === "question-correct" || e.type === "quiz-pass") && dayIn(tz, new Date(e.at)) === d);
      const settled = mine.some((e) => e.type === "inactivity-penalty" && e.refId === d);
      if (!settled && !learned && !activity.has(d)) {
        const total = Math.max(0, mine.reduce((a, e) => a + e.amount, 0));
        const v = Math.min(pen, total);
        events.push({ id: rid("xp"), userId: me.id, type: "inactivity-penalty", refId: d, amount: -v, at: new Date().toISOString(), source: "penalty", description: `No Beast Topics, videos or quizzes on ${d}` });
        write(K.xp, events);
        if (v > 0) {
          deducted += v;
          days++;
        }
      }
      d = addDays(d, 1);
    }
    this.recomputeXp(me.id);
    return { deducted, days };
  }

  async listXpEvents(userId?: string) {
    return read<XpEvent[]>(K.xp, []).filter((e) => !userId || e.userId === userId);
  }

  async submitQuiz(userId: string, quizId: string, answers: Record<string, number>, attemptId?: string): Promise<QuizAttempt> {
    return withXpLock(() => this.submitUnlocked(userId, quizId, answers, attemptId));
  }

  /** Caller must hold the XP lock. One attempt id = one graded result = its XP awarded once. */
  private async submitUnlocked(userId: string, quizId: string, answers: Record<string, number>, attemptId?: string): Promise<QuizAttempt> {
    const progress = await this.getProgress(userId);
    const existing = attemptId ? progress.quizAttempts.find((a) => a.id === attemptId) : undefined;
    if (existing) {
      if (existing.quizId !== quizId) throw new Error("This attempt belongs to a different quiz");
      return existing; // repeat of an attempt that was already graded: same result, no XP
    }
    const content = await this.getContent();
    const g = gradeQuiz(quizId, answers, new Set(progress.correctQuestions), content.extraQuestions);
    const id = attemptId ?? rid("qa");
    const { quizTitle } = await import("@/lib/learning/history");
    const { getQuestion } = await import("@/lib/learning");
    const title = quizTitle(quizId);
    const tag = { id, source: (quizId.startsWith("topic:") ? "quiz" : "challenge") as XpEvent["source"] };
    let xp = 0;
    for (const qid of g.newlyCorrect) {
      const q = getQuestion(qid) ?? content.extraQuestions.find((e) => e.question.id === qid)?.question;
      xp += (await this.awardUnlocked(userId, "question-correct", qid, q?.xp ?? 0, `Correct answer — ${title}`, tag)).awarded;
    }
    const passBonus = g.passed ? (await this.awardUnlocked(userId, "quiz-pass", quizId, undefined, `Passed: ${title}`, tag)).awarded : 0;
    xp += passBonus;
    await this.recordActivity("quiz", quizId);
    const attempt: QuizAttempt = { id, quizId, at: new Date().toISOString(), answers, correct: g.correct, total: g.total, percent: g.percent, passed: g.passed, xpAwarded: xp, passBonus };
    const latest = await this.getProgress(userId); // re-read: recordActivity/awards awaited in between
    latest.correctQuestions = [...new Set([...latest.correctQuestions, ...g.newlyCorrect])];
    latest.quizAttempts = [...latest.quizAttempts, attempt];
    await this.saveProgress(latest);
    return attempt;
  }

  async getContent(): Promise<AdminContent> {
    const c = { ...EMPTY_CONTENT, ...read<Partial<AdminContent>>(K.content, {}) };
    return { ...c, videos: c.videos.filter((v) => v.published !== false) };
  }
  private allVideos(): Video[] {
    return read<Partial<AdminContent>>(K.content, {}).videos ?? [];
  }
  async adminListVideos() {
    this.requireAdmin();
    return [...this.allVideos()].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
  async saveVideo(v: Video) {
    this.requireAdmin();
    const now = new Date().toISOString();
    const list = this.allVideos();
    const prev = list.find((x) => x.id === v.id);
    const next: Video = { ...v, createdAt: prev?.createdAt ?? v.createdAt ?? now, updatedAt: now, published: v.published !== false };
    write(K.content, { ...read<Partial<AdminContent>>(K.content, {}), videos: prev ? list.map((x) => (x.id === v.id ? next : x)) : [next, ...list] });
    return next;
  }
  async deleteVideo(v: Video) {
    this.requireAdmin();
    write(K.content, { ...read<Partial<AdminContent>>(K.content, {}), videos: this.allVideos().filter((x) => x.id !== v.id) });
    for (const p of [v.storagePath, v.thumbnailPath]) if (p) await idbDelete(p).catch(() => undefined);
  }
  async uploadVideoAsset(kind: "video" | "thumb", videoId: string, file: File, opts?: UploadOptions) {
    this.requireAdmin();
    if (opts?.signal?.aborted) throw new UploadCancelled();
    const path = `${kind === "video" ? "videos" : "thumbs"}/${videoId}/${storageName(file.name)}`;
    opts?.onProgress?.(0.5);
    await idbPut(path, file);
    opts?.onProgress?.(1);
    return path;
  }
  async videoAssetUrl(path: string) {
    const blob = await idbGet(path).catch(() => null);
    return blob ? URL.createObjectURL(blob) : null;
  }
  async saveContent(c: Partial<AdminContent>) {
    const me = await this.currentUser();
    if (!isStaff(me?.role)) throw new Error("Only administrators can edit content.");
    // merge into the stored content (getContent() hides draft videos)
    const next = { ...EMPTY_CONTENT, ...read<Partial<AdminContent>>(K.content, {}), ...c };
    write(K.content, next);
    return this.getContent();
  }
}
