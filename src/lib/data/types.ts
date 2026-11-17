import type { ComponentRecord, Profile, Project } from "@/lib/types";
import type { TrackDef } from "@/lib/sim/types";

export interface Progress {
  userId: string;
  completedTopics: string[];
  bookmarks: string[];
  lastTopic: string | null;
  /** question ids answered correctly at least once (XP is only ever awarded once per question) */
  correctQuestions: string[];
  quizAttempts: QuizAttempt[];
  watchedVideos: string[];
  /** records per track: best lap etc. */
  records: Record<string, { bestLapS?: number; bestCompletion?: number; wins?: number }>;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  at: string;
  answers: Record<string, number>;
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  xpAwarded: number;
}

export type XpEventType =
  | "lesson-complete"
  | "question-correct"
  | "quiz-pass"
  | "project-created"
  | "validation-pass"
  | "code-check-pass"
  | "simulation-first"
  | "lap-complete"
  | "record-improved"
  | "sumo-win"
  | "track-created"
  | "competition-win"
  | "inactivity-penalty";

export interface XpEvent {
  id: string;
  userId: string;
  type: XpEventType;
  refId: string;
  amount: number;
  at: string;
}

/**
 * Default XP rules. In cloud mode the amounts live in the Supabase `xp_rules` table (admins edit them in
 * /admin → XP Rules) and the server decides what each event is worth; in local mode admin overrides are
 * stored with the other admin content. XP rewards real work — own designs, own code, successful runs.
 */
export const XP_RULES: Record<XpEventType, { amount: number; label: string; description: string; limit?: number; editable: boolean }> = {
  "validation-pass": { amount: 60, label: "Designed a working robot", description: "Your own robot design (components, wiring, power) passes validation. Once per project; Garage designs don't count.", editable: true },
  "code-check-pass": { amount: 80, label: "Wrote own code that matches the circuit", description: "Your own program compiles and matches your wiring. Code that is mostly a starter template or Garage firmware earns nothing.", editable: true },
  "lap-complete": { amount: 150, label: "Completed a track with own code", description: "Your own code drives the robot round a track in the Simulation Arena. Once per project and track.", editable: true },
  "sumo-win": { amount: 150, label: "Won a sumo match with own code", description: "Your own code wins a sumo match. Once per arena and opponent level.", editable: true },
  "record-improved": { amount: 25, label: "Beat own best lap", description: "Your own code beats your previous best lap on a track.", editable: true },
  "track-created": { amount: 20, label: "Designed a track", description: "Saved a new track in the Track Designer.", limit: 5, editable: true },
  "competition-win": { amount: 200, label: "Won a competition", description: "Awarded for club competition wins.", editable: true },
  "lesson-complete": { amount: 20, label: "Completed a lesson", description: "Marked a Beast Topic as complete.", editable: true },
  "quiz-pass": { amount: 25, label: "Passed a quiz", description: "Bonus for passing a quiz (each question also carries its own XP).", editable: true },
  "question-correct": { amount: 0, label: "Answered a question correctly", description: "Each question carries its own XP, awarded once.", editable: false },
  "inactivity-penalty": { amount: 10, label: "Day without Beast Topics or quizzes", description: "Deducted for each day with no topic studied, video watched, lesson completed or quiz taken. Never takes XP below 0; staff are exempt.", editable: true },
  "project-created": { amount: 0, label: "Created a project", description: "Retired: creating or opening projects no longer earns XP (older history may still show it).", editable: false },
  "simulation-first": { amount: 0, label: "First simulation", description: "Retired: just running a simulation no longer earns XP — completing tracks with own code does.", editable: false },
};

export interface XpRuleValue {
  amount: number;
  /** maximum number of times a student can earn this (null = unlimited) */
  limit: number | null;
}

export interface XpConfig {
  rules: Record<XpEventType, XpRuleValue>;
  penalty: { enabled: boolean; timezone: string; start: string; maxDaysBack: number };
}

export function defaultXpConfig(): XpConfig {
  const rules = Object.fromEntries(Object.entries(XP_RULES).map(([k, v]) => [k, { amount: v.amount, limit: v.limit ?? null }])) as Record<XpEventType, XpRuleValue>;
  return { rules, penalty: { enabled: true, timezone: "Asia/Kolkata", start: new Date().toISOString().slice(0, 10), maxDaysBack: 30 } };
}

export type LearningActivityKind = "topic" | "video" | "lesson" | "quiz";

export interface Video {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  description: string;
  competition: "race" | "line" | "sumo" | "all";
  topicId?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  category: "Electronics" | "Arduino" | "Sensors" | "Motor Drivers" | "Chassis" | "Line Following" | "Robo Race" | "Robo War" | "Advanced Robotics";
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  at: string;
  kind: "announcement" | "competition" | "challenge";
}

export interface Mission {
  day: string;
  title: string;
  description: string;
  topicIds: string[];
}

export interface CompetitionRules {
  sumo: { maxLength_mm: number; maxWidth_mm: number; maxMass_g: number; matchTimeS: number; startDelayS: number };
  race: { laps: number; maxLength_mm: number; maxWidth_mm: number };
  line: { maxLength_mm: number; maxWidth_mm: number; timeLimitS: number };
  bluetoothAllowedInSumo: boolean;
}

export interface AdminContent {
  videos: Video[];
  announcements: Announcement[];
  missions: Mission[] | null; // null = default schedule
  rules: CompetitionRules;
  componentOverrides: Record<string, Partial<ComponentRecord>>;
  addedComponents: ComponentRecord[];
  featuredProjects: string[];
  topicOverrides: Record<string, { title?: string; summary?: string; extraNotes?: string }>;
  /** local mode only — cloud mode keeps XP settings in the xp_rules / xp_settings tables */
  xpConfig?: XpConfig;
  extraQuestions: { topicId: string; question: import("@/lib/learning/types").QuizQuestion }[];
}

export const DEFAULT_RULES: CompetitionRules = {
  sumo: { maxLength_mm: 100, maxWidth_mm: 100, maxMass_g: 500, matchTimeS: 180, startDelayS: 5 },
  race: { laps: 3, maxLength_mm: 300, maxWidth_mm: 250 },
  line: { maxLength_mm: 300, maxWidth_mm: 250, timeLimitS: 180 },
  bluetoothAllowedInSumo: false,
};

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: Profile["role"];
  createdAt: string;
}

export interface RoleAuditEntry {
  id: string;
  at: string;
  actorEmail: string | null;
  targetEmail: string | null;
  oldRole: string | null;
  newRole: string;
  action: "promote" | "revoke" | "bootstrap";
  note: string | null;
}

export interface Backend {
  readonly mode: "local" | "supabase";
  currentUser(): Promise<Profile | null>;
  signUp(input: { name: string; email: string; password: string; campus: string; studentId: string }): Promise<Profile>;
  signIn(email: string, password: string): Promise<Profile>;
  signOut(): Promise<void>;
  updateProfile(p: Partial<Profile> & { id: string }): Promise<Profile>;
  listProfiles(): Promise<Profile[]>;
  /** Super Admin only: set a user's role to student or admin (enforced on the server in cloud mode, audited). */
  setRole(userId: string, role: "student" | "admin", note?: string): Promise<void>;
  /** Super Admin only: find a registered account by email. */
  findUserByEmail(email: string): Promise<StaffAccount | null>;
  /** Admins: accounts with admin or super_admin role. */
  listStaff(): Promise<StaffAccount[]>;
  /** Admins: role-change history, newest first. */
  listRoleAudit(): Promise<RoleAuditEntry[]>;

  listProjects(ownerId: string): Promise<Project[]>;
  listAllProjects(): Promise<Project[]>;
  saveProject(p: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listTracks(ownerId: string | null): Promise<TrackDef[]>;
  saveTrack(t: TrackDef): Promise<void>;
  deleteTrack(id: string): Promise<void>;

  getProgress(userId: string): Promise<Progress>;
  saveProgress(p: Progress): Promise<void>;

  /** Server-validated XP award: idempotent per (user, type, refId). Returns XP actually awarded. */
  awardXp(userId: string, type: XpEventType, refId: string, amount?: number): Promise<{ awarded: number; total: number }>;
  listXpEvents(userId?: string): Promise<XpEvent[]>;
  /** XP amounts and the inactivity-penalty settings (everyone can read; admins can save). */
  getXpConfig(): Promise<XpConfig>;
  saveXpConfig(cfg: XpConfig): Promise<void>;
  /** Records today's learning activity (studying a topic, watching a video) so the day isn't penalised. */
  recordActivity(kind: LearningActivityKind, ref: string): Promise<void>;
  /** Applies the daily penalty for past days without learning activity (server-side in cloud mode). */
  applyInactivityPenalties(): Promise<{ deducted: number; days: number }>;
  /** Graded on the server in Supabase mode (answer keys are not readable by students). */
  submitQuiz(userId: string, quizId: string, answers: Record<string, number>): Promise<QuizAttempt>;

  getContent(): Promise<AdminContent>;
  saveContent(c: Partial<AdminContent>): Promise<AdminContent>;
}

export type { TrackDef };
