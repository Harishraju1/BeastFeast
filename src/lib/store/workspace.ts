"use client";
import { create } from "zustand";
import type { ValidationIssue } from "@/lib/types";

/** A repair the student asked for (FIX IT); the Circuit Studio player builds and animates its plan. */
export interface RepairRequest {
  issue: ValidationIssue;
  at: number;
  /** remaining issues queued by "Fix Issues" */
  queue: ValidationIssue[];
}

interface WorkspaceUI {
  selected: string | null;
  focus: { partUid?: string; pinId?: string; wireId?: string; issue?: ValidationIssue; at: number } | null;
  scanning: boolean;
  scanPart: string | null;
  reportOpen: boolean;
  repair: RepairRequest | null;
  /** part whose recommendation panel is open */
  recommendFor: string | null;
  /** custom-component editor (prefilled name/category when opened from a recommendation) */
  customEditor: { name?: string; kind?: string } | null;
  learning: boolean;
  /** explanation drawer of one issue */
  explain: ValidationIssue | null;
  select(uid: string | null): void;
  focusIssue(issue: ValidationIssue): void;
  clearFocus(): void;
  set(p: Partial<WorkspaceUI>): void;
}

export const useWorkspace = create<WorkspaceUI>((set) => ({
  selected: null,
  focus: null,
  scanning: false,
  scanPart: null,
  reportOpen: false,
  repair: null,
  recommendFor: null,
  customEditor: null,
  learning: false,
  explain: null,
  select: (uid) => set({ selected: uid }),
  focusIssue: (issue) => set({ focus: { partUid: issue.partUid, pinId: issue.pinId, wireId: issue.wireId, issue, at: Date.now() }, selected: issue.partUid ?? null, reportOpen: false }),
  clearFocus: () => set({ focus: null }),
  set: (p) => set(p),
}));
