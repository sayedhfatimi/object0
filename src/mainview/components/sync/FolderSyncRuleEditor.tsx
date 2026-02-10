import { useCallback, useEffect, useState } from "react";
import type {
  ConflictResolution,
  FolderSyncRule,
  FolderSyncRuleInput,
  SyncDirection,
} from "../../../shared/folder-sync.types";
import { rpcCall } from "../../lib/rpc-client";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { toast } from "../common/Toast";

interface FolderSyncRuleEditorProps {
  editRule?: FolderSyncRule;
  onDone: () => void;
}

export function FolderSyncRuleEditor({
  editRule,
  onDone,
}: FolderSyncRuleEditorProps) {
  const profiles = useVaultStore((s) => s.profiles);
  const addRule = useFolderSyncStore((s) => s.addRule);
  const updateRule = useFolderSyncStore((s) => s.updateRule);
  const pickFolder = useFolderSyncStore((s) => s.pickFolder);

  const [profileId, setProfileId] = useState(editRule?.profileId ?? "");
  const [bucket, setBucket] = useState(editRule?.bucket ?? "");
  const [bucketPrefix, setBucketPrefix] = useState(
    editRule?.bucketPrefix ?? "",
  );
  const [localPath, setLocalPath] = useState(editRule?.localPath ?? "");
  const [direction, setDirection] = useState<SyncDirection>(
    editRule?.direction ?? "bidirectional",
  );
  const [conflictResolution, setConflictResolution] =
    useState<ConflictResolution>(editRule?.conflictResolution ?? "newer-wins");
  const [pollIntervalMs, setPollIntervalMs] = useState(
    editRule?.pollIntervalMs ?? 30000,
  );
  const [excludePatterns, setExcludePatterns] = useState(
    editRule?.excludePatterns?.join("\n") ??
      ".DS_Store\nThumbs.db\n.object0-tmp\ndesktop.ini",
  );

  const [buckets, setBuckets] = useState<string[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadBuckets = useCallback(async (pid: string) => {
    setLoadingBuckets(true);
    try {
      const result = await rpcCall("buckets:list", { profileId: pid });
      setBuckets(result.map((b) => b.name));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setLoadingBuckets(false);
  }, []);

  useEffect(() => {
    if (profileId) {
      loadBuckets(profileId);
    }
  }, [profileId, loadBuckets]);

  const handlePickFolder = async () => {
    const path = await pickFolder();
    if (path) setLocalPath(path);
  };

  const handleSave = async () => {
    if (!profileId || !bucket || !localPath) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const input: FolderSyncRuleInput = {
        profileId,
        bucket,
        bucketPrefix,
        localPath,
        direction,
        conflictResolution,
        pollIntervalMs,
        excludePatterns: excludePatterns
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      if (editRule) {
        await updateRule({ ...input, id: editRule.id });
        toast.success("Sync rule updated");
      } else {
        await addRule(input);
        toast.success("Sync rule created");
      }
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded border border-success/30 bg-success/10 p-2 text-xs">
        <p className="font-semibold text-success">Live sync rule</p>
        <p className="text-base-content/70">
          This runs continuously in the background between a local folder and an
          S3 path.
        </p>
      </div>

      {/* Profile */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Profile</legend>
        <select
          className="select select-sm w-full"
          value={profileId}
          onChange={(e) => {
            setProfileId(e.target.value);
            setBucket("");
          }}
        >
          <option value="">Select profile...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </fieldset>

      {/* Bucket */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Bucket</legend>
        <select
          className="select select-sm w-full"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          disabled={!profileId || loadingBuckets}
        >
          <option value="">
            {loadingBuckets ? "Loading..." : "Select bucket..."}
          </option>
          {buckets.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </fieldset>

      {/* Bucket prefix */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">
          Bucket Prefix (optional)
        </legend>
        <input
          className="input input-sm w-full"
          placeholder="e.g. photos/ (leave empty for entire bucket)"
          value={bucketPrefix}
          onChange={(e) => setBucketPrefix(e.target.value)}
        />
      </fieldset>

      {/* Local folder */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Local Folder</legend>
        <div className="flex gap-2">
          <input
            className="input input-sm flex-1"
            placeholder="/path/to/folder"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={handlePickFolder}
          >
            <i className="fa-solid fa-folder-open" /> Browse
          </button>
        </div>
      </fieldset>

      {/* Direction */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">
          Sync Direction (continuous rule)
        </legend>
        <select
          className="select select-sm w-full"
          value={direction}
          onChange={(e) => setDirection(e.target.value as SyncDirection)}
        >
          <option value="bidirectional">Bidirectional — sync both ways</option>
          <option value="local-to-remote">Upload only — local → remote</option>
          <option value="remote-to-local">
            Download only — remote → local
          </option>
        </select>
      </fieldset>

      {/* Conflict resolution */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Conflict Resolution</legend>
        <select
          className="select select-sm w-full"
          value={conflictResolution}
          onChange={(e) =>
            setConflictResolution(e.target.value as ConflictResolution)
          }
        >
          <option value="newer-wins">Newer wins (compare timestamps)</option>
          <option value="local-wins">Local always wins</option>
          <option value="remote-wins">Remote always wins</option>
          <option value="keep-both">Keep both (mark as conflict)</option>
        </select>
      </fieldset>

      {/* Poll interval */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">
          Poll Interval (for remote changes)
        </legend>
        <select
          className="select select-sm w-full"
          value={pollIntervalMs}
          onChange={(e) => setPollIntervalMs(Number(e.target.value))}
        >
          <option value={15000}>15 seconds</option>
          <option value={30000}>30 seconds</option>
          <option value={60000}>1 minute</option>
          <option value={300000}>5 minutes</option>
          <option value={600000}>10 minutes</option>
          <option value={1800000}>30 minutes</option>
        </select>
      </fieldset>

      {/* Exclude patterns */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">
          Exclude Patterns (one per line)
        </legend>
        <textarea
          className="textarea textarea-sm w-full font-mono text-xs"
          rows={4}
          placeholder={".DS_Store\nThumbs.db\n.git/**\nnode_modules/**"}
          value={excludePatterns}
          onChange={(e) => setExcludePatterns(e.target.value)}
        />
      </fieldset>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || !profileId || !bucket || !localPath}
        >
          {saving ? (
            <span className="loading loading-spinner loading-xs" />
          ) : editRule ? (
            "Save Changes"
          ) : (
            "Create Rule"
          )}
        </button>
      </div>
    </div>
  );
}
