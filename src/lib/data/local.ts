/**
 * Local backend: everything is stored in this browser (localStorage).
 * Used automatically when Supabase environment variables are not configured.
 * Passwords are salted SHA-256 hashes; this mode is for workshops on a single device and is NOT tamper-proof —
 * configure Supabase for cross-device accounts, server-side XP validation and a campus-wide leaderboard.
 */
import type { Profile, Project } from "@/lib/types";
import type { TrackDef } from "@/lib/sim/types";
import { type AdminContent, type Backend, DEFAULT_RULES, type LearningActivityKind, type Progress, type QuizAttempt, type RoleAuditEntry, type StaffAccount, type XpConfig, type XpEvent, type XpEventType, LEADERBOARD_MIN_XP, type RankEvent, defaultXpConfig, sourceOf } from "./types";
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

  async signUp(input: { name: string; email: string; password: string; campus: string; studentId: string }) {
    const accounts = this.accounts();
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password || input.password.length < 6) throw new Error("Enter an email and a password of at least 6 characters.");
    if (!input.name.trim()) throw new Error("Enter your name.");
    if (accounts.some((a) => a.email === email)) throw new Error("An account with this email already exists on this device.");
    const salt = crypto.randomUUID();
    const profile: Profile = {
      id: rid("u"), name: input.name.trim(), campus: input.campus.trim(), studentId: input.studentId.trim(), avatar: null,
      role: accounts.length === 0 ? "super_admin" : "student", // the first account on a device is its Super Admin
      xp: 0, createdAt: new Date().toISOString(),
    };
    accounts.push({ profile, email, salt, hash: await sha256(salt + input.password) });
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

  async updateProfile(p: Partial<Profile> & { id: string }) {
    const accounts = this.accounts();
    const a = accounts.find((x) => x.profile.id === p.id);
    if (!a) throw new Error("Profile not found");
    const { role: _role, xp: _xp, ...safe } = p; // role and XP cannot be self-edited
    void _role;
    void _xp;
    a.profile = { ...a.profile, ...safe };
    write(K.accounts, accounts);
    return a.profile;
  }

  async listProfiles() {
    return this.accounts().map((a) => a.profile);
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
    if (type === "inactivity-penalty") throw new Error("Penalties are applied automatically.");
    const events = read<XpEvent[]>(K.xp, []);
    const rule = (await this.getXpConfig()).rules[type];
    const value = type === "question-correct" ? Math.max(0, Math.min(15, amount ?? 0)) : rule.amount;
    const mine = events.filter((e) => e.userId === userId);
    const dup = mine.some((e) => e.type === type && e.refId === refId);
    const overLimit = rule.limit !== null && mine.filter((e) => e.type === type).length >= rule.limit;
    let awarded = 0;
    if (!dup && !overLimit && value > 0) {
      events.push({ id: rid("xp"), userId, type, refId, amount: value, at: new Date().toISOString(), source: sourceOf({ type, refId }), description: description ?? null });
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

  async submitQuiz(userId: string, quizId: string, answers: Record<string, number>): Promise<QuizAttempt> {
    const progress = await this.getProgress(userId);
    const content = await this.getContent();
    const g = gradeQuiz(quizId, answers, new Set(progress.correctQuestions), content.extraQuestions);
    let xp = 0;
    const attemptId = rid("qa");
    const { quizTitle } = await import("@/lib/learning/history");
    const title = quizTitle(quizId);
    const before = new Set(read<XpEvent[]>(K.xp, []).map((e) => e.id));
    for (const qid of g.newlyCorrect) {
      const q = (await import("@/lib/learning")).getQuestion(qid) ?? content.extraQuestions.find((e) => e.question.id === qid)?.question;
      xp += (await this.awardXp(userId, "question-correct", qid, q?.xp ?? 0, `Correct answer — ${title}`)).awarded;
    }
    if (g.passed) xp += (await this.awardXp(userId, "quiz-pass", quizId, undefined, `Passed: ${title}`)).awarded;
    // tag this submission's ledger rows with the attempt and its source (topic quiz or challenge)
    const source = quizId.startsWith("topic:") ? "quiz" : "challenge";
    write(K.xp, read<XpEvent[]>(K.xp, []).map((e) => (before.has(e.id) ? e : { ...e, attemptId, source })));
    await this.recordActivity("quiz", quizId);
    const attempt: QuizAttempt = { id: attemptId, quizId, at: new Date().toISOString(), answers, correct: g.correct, total: g.total, percent: g.percent, passed: g.passed, xpAwarded: xp };
    progress.correctQuestions = [...new Set([...progress.correctQuestions, ...g.newlyCorrect])];
    progress.quizAttempts = [...progress.quizAttempts, attempt];
    await this.saveProgress(progress);
    return attempt;
  }

  async getContent(): Promise<AdminContent> {
    return { ...EMPTY_CONTENT, ...read<Partial<AdminContent>>(K.content, {}) };
  }
  async saveContent(c: Partial<AdminContent>) {
    const me = await this.currentUser();
    if (!isStaff(me?.role)) throw new Error("Only administrators can edit content.");
    const next = { ...(await this.getContent()), ...c };
    write(K.content, next);
    return next;
  }
}
