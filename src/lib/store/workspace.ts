"use client";
import { create } from "zustand";
import type { ValidationIssue } from "@/lib/types";

interface WorkspaceUI {
  selected: string | null;
  focus: { partUid?: string; pinId?: string; wireId?: string; issue?: ValidationIssue; at: number } | null;
  scanning: boolean;
  scanPart: string | null;
  reportOpen: boolean;
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
  select: (uid) => set({ selected: uid }),
  focusIssue: (issue) => set({ focus: { partUid: issue.partUid, pinId: issue.pinId, wireId: issue.wireId, issue, at: Date.now() }, selected: issue.partUid ?? null, reportOpen: false }),
  clearFocus: () => set({ focus: null }),
  set: (p) => set(p),
}));
