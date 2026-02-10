import { create } from "zustand";
import type { ProfileInfo } from "../../shared/profile.types";
import type { BucketInfo } from "../../shared/s3.types";
import { rpcCall } from "../lib/rpc-client";

interface ProfileState {
  activeProfileId: string | null;
  activeProfile: ProfileInfo | null;
  buckets: BucketInfo[];
  bucketsLoading: boolean;
  error: string | null;

  setActiveProfile: (profile: ProfileInfo | null) => void;
  loadBuckets: (profileId: string) => Promise<void>;
  clearBuckets: () => void;
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  activeProfileId: null,
  activeProfile: null,
  buckets: [],
  bucketsLoading: false,
  error: null,

  setActiveProfile: (profile) => {
    set({
      activeProfileId: profile?.id ?? null,
      activeProfile: profile,
      buckets: [],
      error: null,
    });
    if (profile) {
      get().loadBuckets(profile.id);
    }
  },

  loadBuckets: async (profileId) => {
    try {
      set({ bucketsLoading: true, error: null });
      const buckets = await rpcCall("buckets:list", { profileId });
      set({ buckets, bucketsLoading: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        bucketsLoading: false,
      });
    }
  },

  clearBuckets: () =>
    set({ buckets: [], activeProfileId: null, activeProfile: null }),
}));
