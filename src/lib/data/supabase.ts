/**
 * Supabase backend (enabled when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set).
 * Only the public anon key is used in the browser; all privileged work happens in RLS policies and
 * SECURITY DEFINER functions (award_xp, complete_lesson, submit_quiz) defined in supabase/migrations.
 */
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Profile, Project } from "@/lib/types";
import type { TrackDef } from "@/lib/sim/types";
import { type AdminContent, type Backend, type LearningActivityKind, type Progress, type QuizAttempt, type RoleAuditEntry, type StaffAccount, type XpConfig, type XpEvent, type XpEventType, LEADERBOARD_MIN_XP, type RankEvent, defaultXpConfig, type SignUpInput, type PrivateDetails, type AdminUserQuery, type AdminUserRow, type NiatReviewRow, type StreakInfo } from "./types";
import { computeStreak } from "@/lib/streak";
import type { Video } from "./types";
import { type UploadOptions, storageName, xhrUpload } from "@/lib/video/upload";
import type { VideoProvider } from "@/lib/video/providers";

const VIDEO_BUCKET = "lesson-videos";
const toVideo = (r: Record<string, unknown>): Video => ({
  id: String(r.id), title: String(r.title), description: String(r.description ?? ""), url: String(r.url ?? ""),
  source: r.source as Video["source"], provider: r.provider as VideoProvider, storagePath: (r.storage_path as string) ?? undefined,
  thumbnail: (r.thumbnail_url as string) ?? undefined, thumbnailPath: (r.thumbnail_path as string) ?? undefined, mime: (r.mime as string) ?? undefined,
  sizeBytes: r.size_bytes == null ? undefined : Number(r.size_bytes), vertical: Boolean(r.vertical),
  category: r.category as Video["category"], competition: r.competition as Video["competition"], difficulty: r.difficulty as Video["difficulty"],
  topicId: (r.topic_id as string) ?? undefined, published: Boolean(r.published), createdAt: String(r.created_at), updatedAt: String(r.updated_at),
});
const fromVideo = (v: Video) => ({
  id: v.id, title: v.title.trim(), description: v.description ?? "", source: v.source ?? "url", provider: v.provider ?? "youtube", url: v.url ?? "",
  provider_id: null, storage_path: v.storagePath ?? null, thumbnail_url: v.thumbnail ?? null, thumbnail_path: v.thumbnailPath ?? null,
  mime: v.mime ?? null, size_bytes: v.sizeBytes ?? null, vertical: !!v.vertical, category: v.category, competition: v.competition,
  difficulty: v.difficulty, topic_id: v.topicId ?? null, published: v.published !== false,
});
import { EMPTY_CONTENT } from "./local";
import { squareImage } from "@/lib/avatar-client";

interface ProfileRow {
  id: string;
  name: string;
  campus: string;
  student_id: string;
  avatar: string | null;
  role: Profile["role"];
  xp: number;
  daily_xp?: number;
  rank_level?: number;
  created_at: string;
}
const toProfile = (r: ProfileRow): Profile => ({ id: r.id, name: r.name, campus: r.campus, studentId: r.student_id, avatar: r.avatar, role: r.role, xp: r.xp, dailyXp: r.daily_xp ?? 0, rankLevel: r.rank_level ?? 1, createdAt: r.created_at });

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendlyError(res.error.message));
  return res.data;
}

import { EMAIL_LIMIT_REACHED, SIGNIN_NETWORK_LIMIT, TEMPORARILY_UNAVAILABLE, emailRecentlySent } from "@/lib/messages";
export { EMAIL_LIMIT_REACHED, TEMPORARILY_UNAVAILABLE };

/**
 * One email of each kind per address per device per minute: double clicks, impatient retries and
 * "sign up again" never spend the club's email allowance twice. The server keeps its own limits as well.
 */
const EMAIL_COOLDOWN_S = 60;
function emailGuard(kind: "signup" | "reset", email: string) {
  if (typeof window === "undefined") return { check() {}, mark() {} };
  const key = `bf.emailSent.${kind}.${email.trim().toLowerCase()}`;
  return {
    check() {
      let at = 0;
      try {
        at = Number(localStorage.getItem(key) ?? 0);
      } catch {
        /* storage blocked: rely on the server limits */
      }
      const ago = (Date.now() - at) / 1000;
      if (at && ago < EMAIL_COOLDOWN_S) throw new Error(emailRecentlySent(ago));
    },
    mark() {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {
        /* ignore */
      }
    },
  };
}
const authRedirect = (path: string) => (typeof window === "undefined" ? undefined : `${window.location.origin}${path}`);

/**
 * Messages raised by our database functions are written for users and pass through; known low-level ones
 * are reworded; anything that looks like internal server, database or gateway detail is never shown.
 */
export function friendlyError(msg: string): string {
  if (/over_email_send_rate_limit|email rate limit/i.test(msg)) return EMAIL_LIMIT_REACHED;
  if (/too many requests|rate limit/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) return "Network connection failed. Check your internet connection and try again.";
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return "Your session has expired. Please sign in again.";
  if (/permission denied|row-level security/i.test(msg)) return "Permission denied.";
  if (/duplicate key value/i.test(msg)) return "That record already exists.";
  if (/<!doctype|<html|PGRST\d|statement timeout|upstream|connection pool|connection (termination|refused|reset)|could not connect|ECONN|ETIMEDOUT|gateway|service unavailable|internal server error|relation .* does not exist|column .* does not exist|function .* does not exist|syntax error|violates .* constraint|database error/i.test(msg)) return TEMPORARILY_UNAVAILABLE;
  return msg;
}

const toDetails = (r: { phone: string | null; niat_id: string | null; legacy_student_id: string | null } | null, email: string | null = null): PrivateDetails => ({
  email,
  phone: r?.phone ?? null,
  niatId: r?.niat_id ?? null,
  legacyStudentId: r?.legacy_student_id ?? null,
});

const toAttempt = (a: Record<string, unknown>): QuizAttempt => ({
  id: String(a.id), quizId: String(a.quiz_id), at: String(a.at), answers: a.answers as Record<string, number>, correct: Number(a.correct), total: Number(a.total), percent: Number(a.percent), passed: Boolean(a.passed), xpAwarded: Number(a.xp_awarded),
  passBonus: a.pass_bonus === null || a.pass_bonus === undefined ? null : Number(a.pass_bonus),
});

export class SupabaseBackend implements Backend {
  readonly mode = "supabase" as const;
  private sb: SupabaseClient;
  /** Admin monitoring reads. Only the admin_monitoring_* functions, which check the caller's role on the server. */
  async monitoringRpc<T>(fn: `admin_monitoring_${string}`, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(friendlyError(error.message));
    return data as T;
  }
  private readonly url: string;
  private readonly anonKey: string;
  constructor(url: string, anonKey: string) {
    this.url = url.replace(/\/$/, "");
    this.anonKey = anonKey;
    // Session lives in cookies (not localStorage) so the server can verify who is signed in — the /admin
    // layout checks the user's role on the server before rendering anything.
    // Outside a browser (tests, scripts, pre-rendering) there are no cookies: use a session-less client.
    this.sb = typeof window === "undefined" ? createClient(url, anonKey, { auth: { persistSession: false } }) : createBrowserClient(url, anonKey);
    if (typeof window !== "undefined") {
      // a password-reset link that lands anywhere other than /reset-password still ends up on the reset form
      this.sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") window.location.assign("/reset-password");
      });
    }
  }

  private async uid() {
    const { data } = await this.sb.auth.getUser();
    return data.user?.id ?? null;
  }

  async currentUser() {
    const id = await this.uid();
    if (!id) return null;
    const row = check(await this.sb.from("profiles").select("*").eq("id", id).maybeSingle());
    return row ? toProfile(row as ProfileRow) : null;
  }
  async signUp(input: SignUpInput) {
    const guard = emailGuard("signup", input.email);
    guard.check();
    const res = await this.sb.auth.signUp({ email: input.email.trim(), password: input.password, options: { emailRedirectTo: authRedirect("/login?confirmed=1"), data: { name: input.name.trim(), phone: input.phone, niat_id: input.niatId, campus: input.campus.trim() } } });
    if (res.error) {
      // the database trigger rejects invalid or duplicate NIAT IDs / phones; Auth reports that generically
      if (/database error/i.test(res.error.message)) throw new Error("We couldn't create the account. Check your NIAT Student ID, campus name and mobile number — the NIAT ID may already be registered.");
      if (/already registered|already been registered/i.test(res.error.message)) throw new Error("An account with this email already exists. Sign in instead.");
      throw new Error(friendlyError(res.error.message));
    }
    // an already-confirmed address comes back with no identities and no email is sent
    if (res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) throw new Error("An account with this email already exists. Sign in instead (or use “Forgot password?”).");
    if (!res.data.session) {
      guard.mark();
      throw new Error("Check your email to confirm your account, then sign in.");
    }
    const p = await this.currentUser();
    if (!p) throw new Error("Your account was created, but your profile isn't ready yet. Please sign in again in a minute.");
    return p;
  }
  async signIn(email: string, password: string) {
    const res = await this.sb.auth.signInWithPassword({ email, password });
    if (res.error) {
      if (/invalid login credentials/i.test(res.error.message)) throw new Error("Incorrect email or password.");
      if (/email not confirmed/i.test(res.error.message)) throw new Error("EMAIL_NOT_CONFIRMED: Confirm your email first — open the link we sent you (check spam too), then sign in.");
      if (/rate limit|too many requests/i.test(res.error.message) && !/email/i.test(res.error.message)) throw new Error(SIGNIN_NETWORK_LIMIT);
      throw new Error(friendlyError(res.error.message));
    }
    const p = await this.currentUser();
    if (!p) throw new Error("No profile found for this account.");
    return p;
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  async requestPasswordReset(email: string) {
    const guard = emailGuard("reset", email);
    guard.check();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (!error) return guard.mark();
    if (/over_email_send_rate_limit|email rate limit/i.test(error.message)) throw new Error(EMAIL_LIMIT_REACHED);
    if (/rate limit|security purposes|only request this/i.test(error.message)) throw new Error("A reset link was sent recently. Please wait a minute before asking for another.");
    if (/invalid.*email|validate email/i.test(error.message)) throw new Error("Enter a valid email address.");
    throw new Error(friendlyError(error.message));
  }
  async resendConfirmation(email: string) {
    const guard = emailGuard("signup", email);
    guard.check();
    const { error } = await this.sb.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirect("/login?confirmed=1") } });
    if (!error) return guard.mark();
    if (/over_email_send_rate_limit|email rate limit/i.test(error.message)) throw new Error(EMAIL_LIMIT_REACHED);
    if (/rate limit|security purposes|only request this/i.test(error.message)) throw new Error("A confirmation email was sent recently. Please wait a minute before asking for another.");
    if (/already confirmed|already registered/i.test(error.message)) throw new Error("This email is already confirmed — you can sign in.");
    throw new Error(friendlyError(error.message));
  }
  async signInWithGoogle(next: string) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirect(`/login?oauth=1&next=${encodeURIComponent(next)}`) } });
    if (error) throw new Error(/provider is not enabled|unsupported provider/i.test(error.message) ? "Google sign-in is not switched on for this site yet. Use your email and password." : friendlyError(error.message));
  }
  async updatePassword(newPassword: string) {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (!error) return;
    if (/different from the old/i.test(error.message)) throw new Error("Choose a password different from your old one.");
    if (/session|not authenticated|jwt/i.test(error.message)) throw new Error("Your reset link has expired. Request a new one.");
    if (/weak|at least/i.test(error.message)) throw new Error("That password is too weak. Use at least 8 characters with letters and a number.");
    throw new Error(friendlyError(error.message));
  }
  async hasRecoverySession() {
    // getSession() waits until the client has exchanged the ?code= from the reset link for a session
    const { data } = await this.sb.auth.getSession();
    return !!data.session;
  }
  async updateProfile(p: Partial<Profile> & { id: string }) {
    // name and campus only — the avatar goes through /api/avatar, IDs through complete_my_details()
    const row = check(await this.sb.from("profiles").update({ name: p.name, campus: p.campus }).eq("id", p.id).select("*").single());
    return toProfile(row as ProfileRow);
  }
  async getMyDetails() {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) return toDetails(null);
    return toDetails(check(await this.sb.from("profile_private").select("phone, niat_id, legacy_student_id").eq("user_id", data.user.id).maybeSingle()), data.user.email ?? null);
  }
  async completeMyDetails(input: { niatId?: string; phone?: string }) {
    check(await this.sb.rpc("complete_my_details", { p_niat: input.niatId ?? null, p_phone: input.phone ?? null }));
    return this.getMyDetails();
  }
  async niatIdAvailable(niatId: string) {
    return Boolean(check(await this.sb.rpc("niat_id_available", { p_niat: niatId })));
  }
  private async avatarRequest(init: RequestInit) {
    let res: Response;
    try {
      res = await fetch("/api/avatar", { ...init, credentials: "same-origin" });
    } catch {
      throw new Error("Network connection failed. Check your internet connection and try again.");
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Upload failed. Please try again.");
    const p = await this.currentUser();
    if (!p) throw new Error("Your session has expired. Please sign in again.");
    return p;
  }
  async setAvatar(file: Blob) {
    let upload: Blob;
    try {
      upload = await squareImage(file, 512);
    } catch {
      throw new Error("Could not read that image. Choose a JPEG, PNG or WebP picture.");
    }
    const fd = new FormData();
    fd.append("file", upload, "avatar.webp");
    return this.avatarRequest({ method: "POST", body: fd });
  }
  async removeAvatar() {
    return this.avatarRequest({ method: "DELETE" });
  }
  async adminListUsers(q: AdminUserQuery) {
    const rows = check(
      await this.sb.rpc("admin_list_users", {
        p_search: q.search?.trim() || null, p_role: q.role || null, p_status: q.status || null,
        p_min_rank: q.minRank ?? null, p_max_rank: q.maxRank ?? null, p_limit: q.limit, p_offset: q.offset,
        // only sent when filtering, so this also works against a database without the campus filter yet
        ...(q.campus?.trim() ? { p_campus: q.campus.trim() } : {}),
      }),
    ) as Record<string, unknown>[];
    return {
      total: rows.length ? Number(rows[0].total) : 0,
      rows: rows.map((r): AdminUserRow => ({
        id: String(r.id), name: String(r.name), email: String(r.email ?? ""), phone: (r.phone as string) ?? null, niatId: (r.niat_id as string) ?? null,
        legacyStudentId: (r.legacy_student_id as string) ?? null, avatar: (r.avatar as string) ?? null, role: r.role as Profile["role"],
        xp: Number(r.xp), dailyXp: Number(r.daily_xp ?? 0), rankLevel: Number(r.rank_level ?? 1), createdAt: String(r.created_at),
        lastSignInAt: (r.last_sign_in_at as string) ?? null, status: r.status as AdminUserRow["status"], campus: String(r.campus ?? ""),
      })),
    };
  }
  async adminSetCampus(userId: string, campus: string) {
    return String(check(await this.sb.rpc("admin_set_campus", { p_user: userId, p_campus: campus })));
  }
  async adminSetNiat(userId: string, niatId: string) {
    return String(check(await this.sb.rpc("admin_set_niat", { p_user: userId, p_niat: niatId })));
  }
  async adminNiatReview(): Promise<NiatReviewRow[]> {
    const rows = check(await this.sb.rpc("admin_niat_review")) as Record<string, unknown>[];
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email ?? ""), campus: String(r.campus ?? ""), niatId: (r.niat_id as string) ?? null, legacyStudentId: (r.legacy_student_id as string) ?? null, issue: r.issue as NiatReviewRow["issue"], createdAt: String(r.created_at) }));
  }
  async adminCampuses() {
    const rows = check(await this.sb.rpc("admin_campuses")) as { campus: string; students: number }[];
    return rows.map((r) => ({ campus: r.campus, students: Number(r.students) }));
  }
  async myStreak(): Promise<StreakInfo | null> {
    const { data: auth } = await this.sb.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await this.sb.rpc("my_streak");
    if (!error && Array.isArray(data) && data[0]) {
      const r = data[0] as Record<string, unknown>;
      return { current: Number(r.current_streak), longest: Number(r.longest_streak), activeToday: Boolean(r.active_today), lastActive: (r.last_active as string) ?? null, today: String(r.today), timezone: String(r.timezone) };
    }
    // database without the streak table yet: the same rules applied to the student's own XP ledger
    return computeStreak(await this.listXpEvents(auth.user.id));
  }
  async listProfiles() {
    return (check(await this.sb.from("profiles").select("*")) as ProfileRow[]).map(toProfile);
  }
  async setRole(userId: string, role: "student" | "admin", note?: string) {
    // admin_set_role() checks the caller is the Super Admin, protects super_admin accounts and writes the audit log
    check(await this.sb.rpc("admin_set_role", { p_user: userId, p_role: role, p_note: note ?? null }));
  }
  async findUserByEmail(email: string): Promise<StaffAccount | null> {
    const rows = check(await this.sb.rpc("admin_find_user", { p_email: email })) as { id: string; name: string; email: string; role: Profile["role"]; created_at: string }[];
    const r = rows?.[0];
    return r ? { id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at } : null;
  }
  async listStaff(): Promise<StaffAccount[]> {
    const rows = check(await this.sb.rpc("admin_list_staff")) as { id: string; name: string; email: string; role: Profile["role"]; created_at: string }[];
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at }));
  }
  async listRoleAudit(): Promise<RoleAuditEntry[]> {
    const rows = check(await this.sb.from("role_audit_log").select("*").order("at", { ascending: false }).limit(200)) as Record<string, unknown>[];
    return rows.map((r) => ({ id: String(r.id), at: String(r.at), actorEmail: (r.actor_email as string) ?? null, targetEmail: (r.target_email as string) ?? null, oldRole: (r.old_role as string) ?? null, newRole: String(r.new_role), action: r.action as RoleAuditEntry["action"], note: (r.note as string) ?? null }));
  }

  async listProjects(ownerId: string) {
    const rows = check(await this.sb.from("projects").select("data").eq("owner_id", ownerId).order("updated_at", { ascending: false })) as { data: Project }[];
    return rows.map((r) => r.data);
  }
  async listAllProjects() {
    return (check(await this.sb.from("projects").select("data")) as { data: Project }[]).map((r) => r.data);
  }
  async saveProject(p: Project) {
    check(await this.sb.from("projects").upsert({ id: p.id, owner_id: p.ownerId, name: p.name, competition: p.competition, data: p, thumbnail: p.thumbnail ?? null, updated_at: p.updatedAt }));
  }
  async deleteProject(id: string) {
    check(await this.sb.from("projects").delete().eq("id", id));
  }

  async listTracks(ownerId: string | null) {
    let q = this.sb.from("tracks").select("data");
    if (ownerId) q = q.eq("owner_id", ownerId);
    return (check(await q) as { data: TrackDef }[]).map((r) => r.data);
  }
  async saveTrack(t: TrackDef) {
    check(await this.sb.from("tracks").upsert({ id: t.id, owner_id: t.ownerId, name: t.name, kind: t.kind, difficulty: t.difficulty, data: t, updated_at: new Date().toISOString() }));
  }
  async deleteTrack(id: string) {
    check(await this.sb.from("tracks").delete().eq("id", id));
  }

  async getProgress(userId: string): Promise<Progress> {
    let row = check(await this.sb.from("progress").select("*").eq("user_id", userId).maybeSingle()) as Record<string, unknown> | null;
    if (!row) {
      check(await this.sb.from("progress").insert({ user_id: userId }));
      row = { completed_topics: [], bookmarks: [], last_topic: null, correct_questions: [], watched_videos: [], records: {} };
    }
    const attempts = (check(await this.sb.from("quiz_attempts").select("*").eq("user_id", userId)) as Record<string, unknown>[]).map((a) => toAttempt(a));
    return {
      userId,
      completedTopics: (row.completed_topics as string[]) ?? [],
      bookmarks: (row.bookmarks as string[]) ?? [],
      lastTopic: (row.last_topic as string | null) ?? null,
      correctQuestions: (row.correct_questions as string[]) ?? [],
      quizAttempts: attempts,
      watchedVideos: (row.watched_videos as string[]) ?? [],
      records: (row.records as Progress["records"]) ?? {},
    };
  }
  async saveProgress(p: Progress) {
    // completed topics & correct answers are written by the server functions; the client updates the rest
    check(await this.sb.from("progress").upsert({ user_id: p.userId, bookmarks: p.bookmarks, last_topic: p.lastTopic, watched_videos: p.watchedVideos, records: p.records }));
  }

  async awardXp(userId: string, type: XpEventType, refId: string, _amount?: number, description?: string): Promise<{ awarded: number; total: number }> {
    void userId;
    if (type === "lesson-complete") {
      const awarded = check(await this.sb.rpc("complete_lesson", { p_topic: refId })) as number;
      const me = await this.currentUser();
      return { awarded, total: me?.xp ?? 0 };
    }
    const rows = check(await this.sb.rpc("award_xp", { p_type: type, p_ref: refId, p_amount: null, p_description: description ?? null })) as { awarded: number; total: number }[];
    return rows[0] ?? { awarded: 0, total: 0 };
  }
  async listXpEvents(userId?: string) {
    let q = this.sb.from("xp_events").select("*").order("at", { ascending: false });
    if (userId) q = q.eq("user_id", userId);
    return (check(await q) as Record<string, unknown>[]).map(
      (e): XpEvent => ({ id: String(e.id), userId: String(e.user_id), type: e.type as XpEventType, refId: String(e.ref_id), amount: Number(e.amount), at: String(e.at), source: (e.source as XpEvent["source"]) ?? undefined, description: (e.description as string | null) ?? null, attemptId: (e.attempt_id as string | null) ?? null }),
    );
  }
  async listLeaderboard() {
    // filtered and sorted by the database: only students above LEADERBOARD_MIN_XP lifetime XP
    const rows = check(await this.sb.from("profiles").select("*").gt("xp", LEADERBOARD_MIN_XP).order("xp", { ascending: false }).order("created_at", { ascending: true })) as ProfileRow[];
    return rows.map(toProfile);
  }
  async listRankHistory(userId: string): Promise<RankEvent[]> {
    const rows = check(await this.sb.from("rank_history").select("*").eq("user_id", userId).order("at", { ascending: false })) as Record<string, unknown>[];
    return rows.map((r) => ({ id: String(r.id), oldLevel: r.old_level === null ? null : Number(r.old_level), newLevel: Number(r.new_level), xpAt: Number(r.xp_at), at: String(r.at), seen: Boolean(r.seen), note: (r.note as string | null) ?? null }));
  }
  async markRankSeen(ids: string[]) {
    if (!ids.length) return;
    check(await this.sb.rpc("mark_rank_seen", { p_ids: ids.map(Number) }));
  }
  async getXpConfig(): Promise<XpConfig> {
    const cfg = defaultXpConfig();
    const rows = check(await this.sb.from("xp_rules").select("type, amount, max_per_user")) as { type: XpEventType; amount: number; max_per_user: number | null }[];
    for (const r of rows) if (r.type in cfg.rules) cfg.rules[r.type] = { amount: r.amount, limit: r.max_per_user };
    const s = check(await this.sb.from("xp_settings").select("value").eq("key", "penalty").maybeSingle()) as { value: Partial<XpConfig["penalty"]> } | null;
    if (s?.value) cfg.penalty = { ...cfg.penalty, ...s.value };
    return cfg;
  }
  async saveXpConfig(cfg: XpConfig) {
    // RLS: only admins can write xp_rules / xp_settings; the server functions read these amounts
    const rows = Object.entries(cfg.rules).map(([type, v]) => ({ type, amount: Math.round(v.amount), max_per_user: v.limit }));
    check(await this.sb.from("xp_rules").upsert(rows));
    check(await this.sb.from("xp_settings").upsert({ key: "penalty", value: cfg.penalty, updated_at: new Date().toISOString() }));
  }
  async recordActivity(kind: LearningActivityKind, ref: string) {
    check(await this.sb.rpc("record_learning_activity", { p_kind: kind, p_ref: ref }));
  }
  async applyInactivityPenalties() {
    const rows = check(await this.sb.rpc("apply_inactivity_penalties")) as { deducted: number; days: number }[];
    return rows?.[0] ?? { deducted: 0, days: 0 };
  }
  async submitQuiz(_userId: string, quizId: string, answers: Record<string, number>, attemptId?: string): Promise<QuizAttempt> {
    // the database grades the attempt, writes its XP rows and the profile totals in one transaction;
    // a repeat of the same attempt id returns the stored result and awards nothing
    const a = check(await this.sb.rpc("submit_quiz", { p_quiz: quizId, p_answers: answers, p_attempt: attemptId ?? null })) as Record<string, unknown>;
    return toAttempt(a);
  }

  async getContent(): Promise<AdminContent> {
    const row = check(await this.sb.from("app_content").select("value").eq("key", "content").maybeSingle()) as { value: Partial<AdminContent> } | null;
    const content = { ...EMPTY_CONTENT, ...(row?.value ?? {}) };
    // the video library table (migration 0016) replaces the list kept in app_content once it exists
    const { data, error } = await this.sb.from("video_items").select("*").eq("published", true).order("created_at", { ascending: false }).limit(500);
    if (!error && data) content.videos = (data as Record<string, unknown>[]).map(toVideo);
    return content;
  }
  async adminListVideos() {
    const rows = check(await this.sb.from("video_items").select("*").order("created_at", { ascending: false }).limit(1000)) as Record<string, unknown>[];
    return rows.map(toVideo);
  }
  async saveVideo(v: Video) {
    const row = check(await this.sb.from("video_items").upsert(fromVideo(v)).select("*").single()) as Record<string, unknown>;
    return toVideo(row);
  }
  async deleteVideo(v: Video) {
    check(await this.sb.from("video_items").delete().eq("id", v.id));
    const paths = [v.storagePath, v.thumbnailPath].filter((p): p is string => !!p);
    if (paths.length) await this.sb.storage.from(VIDEO_BUCKET).remove(paths); // the row is gone either way; a leftover file is unreadable
  }
  async uploadVideoAsset(kind: "video" | "thumb", videoId: string, file: File, opts?: UploadOptions) {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) throw new Error("Your session has expired. Please sign in again.");
    const path = `${kind === "video" ? "videos" : "thumbs"}/${videoId}/${storageName(file.name)}`;
    await xhrUpload(`${this.url}/storage/v1/object/${VIDEO_BUCKET}/${path}`, file, {
      authorization: `Bearer ${data.session.access_token}`, apikey: this.anonKey, "content-type": file.type || "application/octet-stream", "x-upsert": "false", "cache-control": "3600",
    }, opts);
    return path;
  }
  async videoAssetUrl(path: string) {
    const { data, error } = await this.sb.storage.from(VIDEO_BUCKET).createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  }
  async saveContent(c: Partial<AdminContent>) {
    // merge into the stored row itself (not getContent(), whose video list comes from video_items)
    const row = check(await this.sb.from("app_content").select("value").eq("key", "content").maybeSingle()) as { value: Partial<AdminContent> } | null;
    const next = { ...EMPTY_CONTENT, ...(row?.value ?? {}), ...c };
    check(await this.sb.from("app_content").upsert({ key: "content", value: next, updated_at: new Date().toISOString() }));
    return this.getContent();
  }
}
