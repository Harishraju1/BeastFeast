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
  | "competition-win";

export interface XpEvent {
  id: string;
  userId: string;
  type: XpEventType;
  refId: string;
  amount: number;
  at: string;
}

/** XP rules live in one table; the Supabase `award_xp` function mirrors these amounts server-side. */
export const XP_RULES: Record<XpEventType, { amount: number; label: string; limit?: number }> = {
  "lesson-complete": { amount: 20, label: "Completed a lesson" },
  "question-correct": { amount: 0, label: "Answered a question correctly (question XP)" },
  "quiz-pass": { amount: 25, label: "Passed a quiz" },
  "project-created": { amount: 10, label: "Created a robot project", limit: 5 },
  "validation-pass": { amount: 50, label: "Robot passed validation" },
  "code-check-pass": { amount: 30, label: "Code matches the circuit" },
  "simulation-first": { amount: 30, label: "First simulation of a project" },
  "lap-complete": { amount: 40, label: "Completed a track" },
  "record-improved": { amount: 15, label: "Improved a personal record" },
  "sumo-win": { amount: 60, label: "Won a sumo match" },
  "track-created": { amount: 20, label: "Designed a track", limit: 5 },
  "competition-win": { amount: 200, label: "Won a competition" },
};

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
  /** Graded on the server in Supabase mode (answer keys are not readable by students). */
  submitQuiz(userId: string, quizId: string, answers: Record<string, number>): Promise<QuizAttempt>;

  getContent(): Promise<AdminContent>;
  saveContent(c: Partial<AdminContent>): Promise<AdminContent>;
}

export type { TrackDef };
