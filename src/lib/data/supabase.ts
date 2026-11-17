/**
 * Supabase backend (enabled when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set).
 * Only the public anon key is used in the browser; all privileged work happens in RLS policies and
 * SECURITY DEFINER functions (award_xp, complete_lesson, submit_quiz) defined in supabase/migrations.
 */
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Profile, Project } from "@/lib/types";
import type { TrackDef } from "@/lib/sim/types";
import { type AdminContent, type Backend, type LearningActivityKind, type Progress, type QuizAttempt, type RoleAuditEntry, type StaffAccount, type XpConfig, type XpEvent, type XpEventType, defaultXpConfig } from "./types";
import { EMPTY_CONTENT } from "./local";

interface ProfileRow {
  id: string;
  name: string;
  campus: string;
  student_id: string;
  avatar: string | null;
  role: Profile["role"];
  xp: number;
  created_at: string;
}
const toProfile = (r: ProfileRow): Profile => ({ id: r.id, name: r.name, campus: r.campus, studentId: r.student_id, avatar: r.avatar, role: r.role, xp: r.xp, createdAt: r.created_at });

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseBackend implements Backend {
  readonly mode = "supabase" as const;
  private sb: SupabaseClient;
  constructor(url: string, anonKey: string) {
    // Session lives in cookies (not localStorage) so the server can verify who is signed in — the /admin
    // layout checks the user's role on the server before rendering anything.
    // Outside a browser (tests, scripts, pre-rendering) there are no cookies: use a session-less client.
    this.sb = typeof window === "undefined" ? createClient(url, anonKey, { auth: { persistSession: false } }) : createBrowserClient(url, anonKey);
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
  async signUp(input: { name: string; email: string; password: string; campus: string; studentId: string }) {
    const res = await this.sb.auth.signUp({ email: input.email, password: input.password, options: { data: { name: input.name, campus: input.campus, student_id: input.studentId } } });
    if (res.error) throw new Error(res.error.message);
    if (!res.data.session) throw new Error("Check your email to confirm your account, then sign in.");
    const p = await this.currentUser();
    if (!p) throw new Error("Profile was not created — check the database trigger.");
    return p;
  }
  async signIn(email: string, password: string) {
    const res = await this.sb.auth.signInWithPassword({ email, password });
    if (res.error) throw new Error(res.error.message);
    const p = await this.currentUser();
    if (!p) throw new Error("No profile found for this account.");
    return p;
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  async updateProfile(p: Partial<Profile> & { id: string }) {
    const row = check(await this.sb.from("profiles").update({ name: p.name, campus: p.campus, student_id: p.studentId, avatar: p.avatar }).eq("id", p.id).select("*").single());
    return toProfile(row as ProfileRow);
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
    const attempts = (check(await this.sb.from("quiz_attempts").select("*").eq("user_id", userId)) as Record<string, unknown>[]).map(
      (a): QuizAttempt => ({ id: String(a.id), quizId: String(a.quiz_id), at: String(a.at), answers: a.answers as Record<string, number>, correct: Number(a.correct), total: Number(a.total), percent: Number(a.percent), passed: Boolean(a.passed), xpAwarded: Number(a.xp_awarded) }),
    );
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

  async awardXp(userId: string, type: XpEventType, refId: string): Promise<{ awarded: number; total: number }> {
    void userId;
    if (type === "lesson-complete") {
      const awarded = check(await this.sb.rpc("complete_lesson", { p_topic: refId })) as number;
      const me = await this.currentUser();
      return { awarded, total: me?.xp ?? 0 };
    }
    const rows = check(await this.sb.rpc("award_xp", { p_type: type, p_ref: refId })) as { awarded: number; total: number }[];
    return rows[0] ?? { awarded: 0, total: 0 };
  }
  async listXpEvents(userId?: string) {
    let q = this.sb.from("xp_events").select("*");
    if (userId) q = q.eq("user_id", userId);
    return (check(await q) as Record<string, unknown>[]).map((e): XpEvent => ({ id: String(e.id), userId: String(e.user_id), type: e.type as XpEventType, refId: String(e.ref_id), amount: Number(e.amount), at: String(e.at) }));
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
  async submitQuiz(_userId: string, quizId: string, answers: Record<string, number>): Promise<QuizAttempt> {
    const a = check(await this.sb.rpc("submit_quiz", { p_quiz: quizId, p_answers: answers })) as Record<string, unknown>;
    return { id: String(a.id), quizId, at: String(a.at), answers, correct: Number(a.correct), total: Number(a.total), percent: Number(a.percent), passed: Boolean(a.passed), xpAwarded: Number(a.xp_awarded) };
  }

  async getContent(): Promise<AdminContent> {
    const row = check(await this.sb.from("app_content").select("value").eq("key", "content").maybeSingle()) as { value: Partial<AdminContent> } | null;
    return { ...EMPTY_CONTENT, ...(row?.value ?? {}) };
  }
  async saveContent(c: Partial<AdminContent>) {
    const next = { ...(await this.getContent()), ...c };
    check(await this.sb.from("app_content").upsert({ key: "content", value: next, updated_at: new Date().toISOString() }));
    return next;
  }
}
