"use client";
import { create } from "zustand";
import type { WiredPin } from "@/lib/code/check";

/** Session-only state shared between Code Studio and the Arena (uploaded .hex is not persisted). */
export const useArenaHex = create<{
  hex: { projectId: string; text: string; name: string } | null;
  wired: WiredPin[];
  setHex(projectId: string, text: string | null, name?: string): void;
  setWired(w: WiredPin[]): void;
}>((set) => ({
  hex: null,
  wired: [],
  setHex: (projectId, text, name = "firmware.hex") => set({ hex: text ? { projectId, text, name } : null }),
  setWired: (wired) => set({ wired }),
}));
