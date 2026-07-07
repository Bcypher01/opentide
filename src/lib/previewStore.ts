"use client";

import { create } from "zustand";

interface PreviewState {
  previewTime: number | null;
  setPreview: (time: number) => void;
  clearPreview: () => void;
}

export const usePreviewStore = create<PreviewState>()((set) => ({
  previewTime: null,
  setPreview: (time) => set({ previewTime: time }),
  clearPreview: () => set({ previewTime: null }),
}));
