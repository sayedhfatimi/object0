import { create } from "zustand";
import type {
  JobCompleteEvent,
  JobInfo,
  ProgressEvent,
} from "../../shared/job.types";
import { rpcCall } from "../lib/rpc-client";

interface JobState {
  jobs: JobInfo[];
  loading: boolean;

  refreshJobs: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  updateFromProgress: (event: ProgressEvent) => void;
  updateFromComplete: (event: JobCompleteEvent) => void;
}

export const useJobStore = create<JobState>()((set, get) => ({
  jobs: [],
  loading: false,

  refreshJobs: async () => {
    try {
      set({ loading: true });
      const jobs = await rpcCall("jobs:list", undefined);
      set({ jobs, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  cancelJob: async (jobId) => {
    try {
      await rpcCall("jobs:cancel", { jobId });
      // Refresh to get updated state
      get().refreshJobs();
    } catch {
      // Ignore
    }
  },

  clearCompleted: async () => {
    try {
      await rpcCall("jobs:clear", undefined);
    } catch {
      // Best-effort
    }
    set((s) => ({
      jobs: s.jobs.filter(
        (j) =>
          j.status !== "completed" &&
          j.status !== "failed" &&
          j.status !== "cancelled",
      ),
    }));
  },

  updateFromProgress: (event) => {
    set((s) => {
      const jobs = [...s.jobs];
      const idx = jobs.findIndex((j) => j.id === event.jobId);

      if (idx !== -1) {
        const existing = jobs[idx];
        jobs[idx] = {
          ...existing,
          status: event.status,
          bytesTransferred: event.bytesTransferred,
          bytesTotal: event.bytesTotal,
          percentage: event.percentage,
          speed: event.speed,
          eta: event.eta,
          error: event.error,
          // Mark startedAt the first time a job moves to running
          startedAt:
            existing.startedAt ||
            (event.status === "running" ? new Date().toISOString() : undefined),
        };
      } else {
        // New job appeared
        jobs.unshift({
          id: event.jobId,
          type: event.type,
          status: event.status,
          fileName: event.fileName,
          description: "",
          bytesTransferred: event.bytesTransferred,
          bytesTotal: event.bytesTotal,
          percentage: event.percentage,
          speed: event.speed,
          eta: event.eta,
          error: event.error,
          createdAt: new Date().toISOString(),
        });
      }

      return { jobs };
    });
  },

  updateFromComplete: (event) => {
    set((s) => {
      const jobs = s.jobs.map((j) => {
        if (j.id === event.jobId) {
          return {
            ...j,
            status: event.success
              ? ("completed" as const)
              : ("failed" as const),
            percentage: event.success ? 100 : j.percentage,
            error: event.error,
            completedAt: new Date().toISOString(),
          };
        }
        return j;
      });
      return { jobs };
    });
  },
}));
