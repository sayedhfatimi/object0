import type {
  ConflictResolution,
  FolderSyncRule,
  FolderSyncRuleInput,
  SyncDirection,
} from "@shared/folder-sync.types";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IconFolderOpen, IconSpinner } from "@/lib/icons";
import { rpcCall } from "../../lib/rpc-client";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { toast } from "../common/Toast";

const DEFAULT_POLL_INTERVAL_MS = 30000;
const DEFAULT_EXCLUDE_PATTERNS = [
  ".DS_Store",
  "Thumbs.db",
  ".object0-tmp",
  "desktop.ini",
];

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
    editRule?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  );
  const [excludePatterns, setExcludePatterns] = useState(
    editRule?.excludePatterns?.join("\n") ??
      DEFAULT_EXCLUDE_PATTERNS.join("\n"),
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
        <p className="text-foreground/70">
          This runs continuously in the background between a local folder and an
          S3 path.
        </p>
      </div>

      {/* Profile */}
      <div className="space-y-1.5">
        <Label className="text-xs">Profile</Label>
        <Select
          value={profileId}
          onValueChange={(v) => {
            if (v == null) return;
            setProfileId(v);
            setBucket("");
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Select profile...">
              {(value) =>
                profiles.find((p) => p.id === value)?.name ?? (value as string)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bucket */}
      <div className="space-y-1.5">
        <Label className="text-xs">Bucket</Label>
        <Select
          value={bucket}
          onValueChange={(v) => {
            if (v != null) setBucket(v);
          }}
          disabled={!profileId || loadingBuckets}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue
              placeholder={loadingBuckets ? "Loading..." : "Select bucket..."}
            >
              {(value) => value as string}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {buckets.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bucket prefix */}
      <div className="space-y-1.5">
        <Label className="text-xs">Bucket Prefix (optional)</Label>
        <Input
          className="h-7 text-xs w-full"
          placeholder="e.g. photos/ (leave empty for entire bucket)"
          value={bucketPrefix}
          onChange={(e) => setBucketPrefix(e.target.value)}
        />
      </div>

      {/* Local folder */}
      <div className="space-y-1.5">
        <Label className="text-xs">Local Folder</Label>
        <div className="flex gap-2">
          <Input
            className="h-7 text-xs flex-1"
            placeholder="/path/to/folder"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={handlePickFolder}>
            <IconFolderOpen className="size-3.5" />
            Browse
          </Button>
        </div>
      </div>

      {/* Direction */}
      <div className="space-y-1.5">
        <Label className="text-xs">Sync Direction (continuous rule)</Label>
        <Select
          value={direction}
          onValueChange={(v) => {
            if (v != null) setDirection(v as SyncDirection);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {(value) => {
                const labels: Record<string, string> = {
                  bidirectional: "Bidirectional — sync both ways",
                  "local-to-remote": "Upload only — local → remote",
                  "remote-to-local": "Download only — remote → local",
                };
                return labels[value as string] ?? (value as string);
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bidirectional">
              Bidirectional — sync both ways
            </SelectItem>
            <SelectItem value="local-to-remote">
              Upload only — local → remote
            </SelectItem>
            <SelectItem value="remote-to-local">
              Download only — remote → local
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conflict resolution */}
      <div className="space-y-1.5">
        <Label className="text-xs">Conflict Resolution</Label>
        <Select
          value={conflictResolution}
          onValueChange={(v) => {
            if (v != null) setConflictResolution(v as ConflictResolution);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {(value) => {
                const labels: Record<string, string> = {
                  "newer-wins": "Newer wins (compare timestamps)",
                  "local-wins": "Local always wins",
                  "remote-wins": "Remote always wins",
                  "keep-both": "Keep both (mark as conflict)",
                };
                return labels[value as string] ?? (value as string);
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newer-wins">
              Newer wins (compare timestamps)
            </SelectItem>
            <SelectItem value="local-wins">Local always wins</SelectItem>
            <SelectItem value="remote-wins">Remote always wins</SelectItem>
            <SelectItem value="keep-both">
              Keep both (mark as conflict)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Poll interval */}
      <div className="space-y-1.5">
        <Label className="text-xs">Poll Interval (for remote changes)</Label>
        <Select
          value={String(pollIntervalMs)}
          onValueChange={(v) => {
            if (v != null) setPollIntervalMs(Number(v));
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {(value) => {
                const labels: Record<string, string> = {
                  "15000": "15 seconds",
                  "30000": "30 seconds",
                  "60000": "1 minute",
                  "300000": "5 minutes",
                  "600000": "10 minutes",
                  "1800000": "30 minutes",
                };
                return labels[value as string] ?? (value as string);
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15000">15 seconds</SelectItem>
            <SelectItem value="30000">30 seconds</SelectItem>
            <SelectItem value="60000">1 minute</SelectItem>
            <SelectItem value="300000">5 minutes</SelectItem>
            <SelectItem value="600000">10 minutes</SelectItem>
            <SelectItem value="1800000">30 minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Exclude patterns */}
      <div className="space-y-1.5">
        <Label className="text-xs">Exclude Patterns (one per line)</Label>
        <Textarea
          className="font-mono text-xs w-full"
          rows={4}
          placeholder={".DS_Store\nThumbs.db\n.git/**\nnode_modules/**"}
          value={excludePatterns}
          onChange={(e) => setExcludePatterns(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !profileId || !bucket || !localPath}
        >
          {saving ? (
            <IconSpinner className="size-3.5 animate-spin" />
          ) : editRule ? (
            "Save Changes"
          ) : (
            "Create Rule"
          )}
        </Button>
      </div>
    </div>
  );
}
