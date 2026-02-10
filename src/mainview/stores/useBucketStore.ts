import { create } from "zustand";

interface BucketState {
  selectedBucket: string | null;
  setSelectedBucket: (bucket: string | null) => void;
}

export const useBucketStore = create<BucketState>()((set) => ({
  selectedBucket: null,
  setSelectedBucket: (bucket) => set({ selectedBucket: bucket }),
}));
