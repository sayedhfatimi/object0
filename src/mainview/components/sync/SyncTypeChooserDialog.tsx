import { useEffect, useState } from "react";
import type { SyncEntryPreference } from "../../stores/useUIStore";
import { useUIStore } from "../../stores/useUIStore";
import { Modal } from "../common/Modal";

function optionCopy(preference: SyncEntryPreference) {
  if (preference === "object-sync") {
    return {
      icon: "fa-solid fa-rotate",
      title: "Object Sync (One-time)",
      description: "Copy a bucket/prefix to another bucket or profile once.",
      note: "Runs once and stops.",
    };
  }

  return {
    icon: "fa-solid fa-folder-open",
    title: "Live Folder Sync",
    description: "Keep a local folder and bucket path continuously in sync.",
    note: "Runs in the background.",
  };
}

export function SyncTypeChooserDialog() {
  const open = useUIStore((s) => s.syncChooserOpen);
  const closeSyncChooser = useUIStore((s) => s.closeSyncChooser);
  const setSyncDialogOpen = useUIStore((s) => s.setSyncDialogOpen);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);
  const setSyncEntryPreference = useUIStore((s) => s.setSyncEntryPreference);

  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    if (open) {
      setRememberChoice(false);
    }
  }, [open]);

  const handleChoose = (preference: SyncEntryPreference) => {
    if (rememberChoice) {
      setSyncEntryPreference(preference);
    }
    closeSyncChooser();

    if (preference === "object-sync") {
      setSyncDialogOpen(true);
      return;
    }

    setFolderSyncPanelOpen(true);
  };

  return (
    <Modal
      open={open}
      onClose={closeSyncChooser}
      title="Which Sync Do You Need?"
      actions={
        <button type="button" className="btn btn-sm" onClick={closeSyncChooser}>
          Cancel
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-base-content/60 text-xs">
          Choose your sync type. You can keep asking every time, or remember
          this as the default for the Sync button.
        </p>

        {(["object-sync", "live-folder-sync"] as const).map((preference) => {
          const option = optionCopy(preference);
          return (
            <button
              key={preference}
              type="button"
              className="w-full rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              onClick={() => handleChoose(preference)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-base-200 text-primary">
                  <i className={option.icon} />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{option.title}</div>
                  <div className="mt-0.5 text-base-content/65 text-xs">
                    {option.description}
                  </div>
                  <div className="mt-0.5 text-[10px] text-base-content/45">
                    {option.note}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        <label className="label cursor-pointer justify-start gap-2 border-base-300 border-t pt-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
          />
          <span className="label-text text-base-content/75 text-xs">
            Remember this choice for future Sync clicks
          </span>
        </label>
      </div>
    </Modal>
  );
}
