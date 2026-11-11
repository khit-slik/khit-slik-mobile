import { create } from 'zustand';

interface SplashState {
  // The web app's first page finished loading (or failed), so the splash can leave
  webReady: boolean;
  markWebReady: () => void;
}

export const useSplashStore = create<SplashState>((set) => ({
  webReady: false,
  markWebReady: () => set({ webReady: true }),
}));
