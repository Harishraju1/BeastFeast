"use client";
import { create } from "zustand";
import type { Profile, Project } from "@/lib/types";
import type { TrackDef } from "@/lib/sim/types";
import { type AdminContent, type LearningActivityKind, type Progress, type XpEventType, getBackend } from "@/lib/data";
import { EMPTY_CONTENT } from "@/lib/data/local";
import { setCatalogueOverrides } from "@/lib/catalogue";
import { REFERENCE_MUTABLE_FIELDS, buildFromTemplate, getTemplate } from "@/lib/garage";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface Toast {
  id: number;
  kind: "xp" | "info" | "error" | "success";
  text: string;
}

interface AppState {
  ready: boolean;
  user: Profile | null;
  projects: Project[];
  tracks: TrackDef[];
  progress: Progress | null;
  content: AdminContent;
  saveState: SaveState;
  saveError: string | null;
  toasts: Toast[];
  lastProjectId: string | null;
  // undo stacks per project
  history: Record<string, { past: Project[]; future: Project[] }>;

  init(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { name: string; email: string; password: string; campus: string; studentId: string }): Promise<void>;
  signOut(): Promise<void>;
  refreshUser(): Promise<void>;

  getProject(id: string): Project | undefined;
  createProject(p: Project, opts?: { award?: boolean }): Promise<void>;
  /** BEAST PROJECT GARAGE: open the read-only original (reused if already loaded) or fork a student copy. */
  loadTemplate(templateId: string, mode: "original" | "copy"): Promise<Project>;
  /** Apply a change to a project (records undo history and schedules autosave). */
  updateProject(id: string, fn: (p: Project) => Project, opts?: { history?: boolean }): void;
  undo(id: string): void;
  redo(id: string): void;
  saveNow(id: string, note?: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  duplicateProject(id: string): Promise<Project | null>;
  snapshotVersion(id: string, note: string): void;

  saveTrack(t: TrackDef): Promise<void>;
  deleteTrack(id: string): Promise<void>;

  updateProgress(fn: (p: Progress) => Progress): Promise<void>;
  award(type: XpEventType, refId: string, amount?: number, description?: string): Promise<number>;
  /** Marks today as a learning day (topic studied, video watched) so the daily penalty doesn't apply. */
  recordActivity(kind: LearningActivityKind, ref: string): Promise<void>;
  saveContent(c: Partial<AdminContent>): Promise<void>;
  toast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
}

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
let toastId = 1;
let lastLockNotice = 0;

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  user: null,
  projects: [],
  tracks: [],
  progress: null,
  content: EMPTY_CONTENT,
  saveState: "idle",
  saveError: null,
  toasts: [],
  lastProjectId: null,
  history: {},

  async init() {
    const be = await getBackend();
    const user = await be.currentUser().catch(() => null);
    let content = EMPTY_CONTENT;
    try {
      content = await be.getContent();
    } catch {
      /* not signed in yet (Supabase) */
    }
    setCatalogueOverrides(content.componentOverrides, content.addedComponents);
    let last: string | null = null;
    try {
      last = localStorage.getItem("bf5.lastProject");
    } catch {
      /* ignore */
    }
    if (user) {
      const [projects, tracks, progress] = await Promise.all([be.listProjects(user.id), be.listTracks(user.id), be.getProgress(user.id)]);
      set({ user, projects, tracks, progress, content, ready: true, lastProjectId: last && projects.some((p) => p.id === last) ? last : projects[0]?.id ?? null });
      // settle the daily learning penalty for past days (computed on the server in cloud mode)
      try {
        const pen = await be.applyInactivityPenalties();
        if (pen.deducted > 0) {
          const fresh = await be.currentUser();
          if (fresh) set({ user: fresh });
          get().toast("error", `−${pen.deducted} XP: ${pen.days} day${pen.days === 1 ? "" : "s"} without Beast Topics or quizzes. Study a topic or take a quiz each day to keep your XP.`);
        }
      } catch (e) {
        console.warn("Inactivity check failed", e);
      }
    } else set({ user: null, ready: true, content });
  },
  async signIn(email, password) {
    const be = await getBackend();
    await be.signIn(email, password);
    await get().init();
  },
  async signUp(input) {
    const be = await getBackend();
    await be.signUp(input);
    await get().init();
  },
  async signOut() {
    const be = await getBackend();
    for (const id of Object.keys(timers)) await get().saveNow(id).catch(() => undefined);
    await be.signOut();
    set({ user: null, projects: [], tracks: [], progress: null, history: {}, lastProjectId: null });
  },
  async refreshUser() {
    const be = await getBackend();
    const user = await be.currentUser();
    set({ user });
  },

  getProject: (id) => get().projects.find((p) => p.id === id),

  async createProject(p, opts = { award: true }) {
    const be = await getBackend();
    await be.saveProject(p);
    set({ projects: [p, ...get().projects], lastProjectId: p.id });
    try {
      localStorage.setItem("bf5.lastProject", p.id);
    } catch {
      /* ignore */
    }
    void opts; // creating or opening a project earns no XP — XP comes from designing, coding and simulating
  },

  async loadTemplate(templateId, mode) {
    const user = get().user;
    const t = getTemplate(templateId);
    if (!user || !t) throw new Error("Template not found");
    if (mode === "original") {
      const existing = get().projects.find((p) => p.origin?.mode === "original" && p.origin.templateId === templateId && p.origin.templateVersion === t.metadata.version);
      if (existing) {
        set({ lastProjectId: existing.id });
        return existing;
      }
    }
    const p = buildFromTemplate(t, user.id, mode);
    // opening a reference project is not "creating" one — only a student copy earns project XP
    await get().createProject(p, { award: mode === "copy" });
    return p;
  },

  updateProject(id, fn, opts = { history: true }) {
    const cur = get().projects.find((p) => p.id === id);
    if (!cur) return;
    let next = { ...fn(cur), updatedAt: new Date().toISOString() };
    if (cur.origin?.mode === "original") {
      // reference projects stay unchanged: only run-time fields (track, results, checks) may change
      const mutable = new Set<string>(REFERENCE_MUTABLE_FIELDS);
      const changedLocked = (Object.keys(next) as (keyof Project)[]).some((k) => !mutable.has(k) && JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
      if (changedLocked) {
        if (Date.now() - lastLockNotice > 4000) {
          lastLockNotice = Date.now();
          get().toast("info", "This is the original reference project — use CREATE MY OWN COPY to modify it.");
        }
        const allowed: Partial<Project> = {};
        for (const k of REFERENCE_MUTABLE_FIELDS) (allowed as Record<string, unknown>)[k] = next[k];
        next = { ...cur, ...allowed };
        if (JSON.stringify(next) === JSON.stringify({ ...cur, updatedAt: next.updatedAt })) return;
      }
    }
    const h = get().history[id] ?? { past: [], future: [] };
    set({
      projects: get().projects.map((p) => (p.id === id ? next : p)),
      history: opts.history === false ? get().history : { ...get().history, [id]: { past: [...h.past.slice(-79), cur], future: [] } },
      saveState: "dirty",
      lastProjectId: id,
    });
    try {
      localStorage.setItem("bf5.lastProject", id);
    } catch {
      /* ignore */
    }
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => void get().saveNow(id), 1200);
  },
  undo(id) {
    const h = get().history[id];
    const cur = get().projects.find((p) => p.id === id);
    if (!h?.past.length || !cur) return;
    const prev = h.past[h.past.length - 1];
    set({ projects: get().projects.map((p) => (p.id === id ? prev : p)), history: { ...get().history, [id]: { past: h.past.slice(0, -1), future: [cur, ...h.future] } }, saveState: "dirty" });
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => void get().saveNow(id), 1200);
  },
  redo(id) {
    const h = get().history[id];
    const cur = get().projects.find((p) => p.id === id);
    if (!h?.future.length || !cur) return;
    const next = h.future[0];
    set({ projects: get().projects.map((p) => (p.id === id ? next : p)), history: { ...get().history, [id]: { past: [...h.past, cur], future: h.future.slice(1) } }, saveState: "dirty" });
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => void get().saveNow(id), 1200);
  },
  async saveNow(id) {
    clearTimeout(timers[id]);
    delete timers[id];
    const p = get().projects.find((x) => x.id === id);
    if (!p) return;
    set({ saveState: "saving" });
    try {
      const be = await getBackend();
      await be.saveProject(p);
      set({ saveState: "saved", saveError: null });
    } catch (e) {
      set({ saveState: "error", saveError: (e as Error).message });
      get().toast("error", `Autosave failed: ${(e as Error).message}`);
    }
  },
  snapshotVersion(id, note) {
    get().updateProject(id, (p) => {
      const { versions, ...rest } = p;
      void versions;
      return { ...p, versions: [...p.versions.slice(-19), { id: `v_${Date.now()}`, at: new Date().toISOString(), note, snapshot: JSON.stringify(rest) }] };
    }, { history: false });
  },
  async deleteProject(id) {
    const be = await getBackend();
    await be.deleteProject(id);
    set({ projects: get().projects.filter((p) => p.id !== id), lastProjectId: get().lastProjectId === id ? null : get().lastProjectId });
  },
  async duplicateProject(id) {
    const p = get().projects.find((x) => x.id === id);
    if (!p) return null;
    const now = new Date().toISOString();
    const copy: Project = { ...structuredClone(p), id: `prj_${crypto.randomUUID().slice(0, 10)}`, name: `${p.name} (copy)`, createdAt: now, updatedAt: now, versions: [], simulations: [] };
    await get().createProject(copy);
    return copy;
  },

  async saveTrack(t) {
    const be = await getBackend();
    const isNew = !get().tracks.some((x) => x.id === t.id);
    await be.saveTrack(t);
    set({ tracks: [...get().tracks.filter((x) => x.id !== t.id), t] });
    if (isNew) await get().award("track-created", t.id, undefined, `Designed track: ${t.name}`);
  },
  async deleteTrack(id) {
    const be = await getBackend();
    await be.deleteTrack(id);
    set({ tracks: get().tracks.filter((t) => t.id !== id) });
  },

  async updateProgress(fn) {
    const p = get().progress;
    if (!p) return;
    const next = fn(p);
    set({ progress: next });
    const be = await getBackend();
    await be.saveProgress(next);
  },
  async award(type, refId, amount, description) {
    const user = get().user;
    if (!user) return 0;
    try {
      const be = await getBackend();
      const r = await be.awardXp(user.id, type, refId, amount, description);
      if (r.awarded > 0) {
        set({ user: { ...user, xp: r.total } });
        get().toast("xp", `+${r.awarded} XP`);
        void get().refreshUser(); // picks up daily XP and any rank-up from the server
      }
      return r.awarded;
    } catch (e) {
      console.warn("XP award failed", e);
      return 0;
    }
  },
  async recordActivity(kind, ref) {
    if (!get().user) return;
    try {
      await (await getBackend()).recordActivity(kind, ref);
    } catch (e) {
      console.warn("Activity not recorded", e);
    }
  },
  async saveContent(c) {
    const be = await getBackend();
    const content = await be.saveContent(c);
    setCatalogueOverrides(content.componentOverrides, content.addedComponents);
    set({ content });
  },
  toast(kind, text) {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 3500);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
