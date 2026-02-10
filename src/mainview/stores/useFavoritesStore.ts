import { create } from "zustand";
import { rpcCall } from "../lib/rpc-client";

export interface FavoriteEntry {
  profileId: string;
  bucket: string;
}

interface FavoritesState {
  /** Set of "profileId:bucketName" keys */
  favorites: Set<string>;
  /** Whether initial load from disk has completed */
  loaded: boolean;
  /** Load favorites from disk via Bun process */
  init: () => Promise<void>;
  toggleFavorite: (profileId: string, bucket: string) => void;
  isFavorite: (profileId: string, bucket: string) => boolean;
  /** Remove all favorites associated with a given profile */
  removeByProfile: (profileId: string) => void;
  /** Return all favorites as parsed {profileId, bucket} entries */
  getFavoriteEntries: () => FavoriteEntry[];
}

function makeKey(profileId: string, bucket: string) {
  return `${profileId}:${bucket}`;
}

/** Persist current favorites to disk (fire-and-forget). */
function persistToDisk(favorites: Set<string>) {
  rpcCall("favorites:save", { favorites: [...favorites] }).catch(() => {
    // best-effort — don't block the UI
  });
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  favorites: new Set<string>(),
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    try {
      const keys = await rpcCall("favorites:load", undefined);
      set({ favorites: new Set(keys), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  toggleFavorite: (profileId, bucket) => {
    const key = makeKey(profileId, bucket);
    set((s) => {
      const next = new Set(s.favorites);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      persistToDisk(next);
      return { favorites: next };
    });
  },

  isFavorite: (profileId, bucket) => {
    return get().favorites.has(makeKey(profileId, bucket));
  },

  removeByProfile: (profileId) => {
    set((s) => {
      const next = new Set(
        [...s.favorites].filter((key) => !key.startsWith(`${profileId}:`)),
      );
      persistToDisk(next);
      return { favorites: next };
    });
  },

  getFavoriteEntries: () => {
    return [...get().favorites].map((key) => {
      const idx = key.indexOf(":");
      return {
        profileId: key.slice(0, idx),
        bucket: key.slice(idx + 1),
      };
    });
  },
}));
