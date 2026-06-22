import { useMemo, useState } from "react";
import type { ProfileInfo } from "../../../shared/profile.types";
import { PROVIDER_LABELS } from "../../../shared/profile.types";
import { useS3Buckets } from "../../hooks/useS3Buckets";
import { rpcCall } from "../../lib/rpc-client";
import { useFavoritesStore } from "../../stores/useFavoritesStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { BucketList } from "../buckets/BucketList";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";
import { ProfileForm } from "../profiles/ProfileForm";
import { ProfileList } from "../profiles/ProfileList";
import { Button } from "../ui/button";
import {
  IconArrowsRotate,
  IconAws,
  IconBucket,
  IconCloud,
  IconCloudArrowUp,
  IconDigitalOcean,
  IconFire,
  IconGear,
  IconLock,
  IconPlus,
  IconServer,
  IconStar,
  IconUser,
  IconUserGroup,
  IconGoogle,
} from "../../lib/icons";

interface SidebarProps {
  collapsed: boolean;
  width?: number;
}

export function Sidebar({ collapsed, width = 256 }: SidebarProps) {
  const profiles = useVaultStore((s) => s.profiles);
  const lock = useVaultStore((s) => s.lock);
  const {
    activeProfile,
    buckets,
    bucketsLoading,
    selectedBucket,
    selectBucket,
    selectFavoriteBucket,
    switchProfile,
    refreshBuckets,
  } = useS3Buckets();
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const favoriteEntries = useMemo(
    () =>
      [...favorites].map((key) => {
        const idx = key.indexOf(":");
        return { profileId: key.slice(0, idx), bucket: key.slice(idx + 1) };
      }),
    [favorites],
  );
  const [addingProfile, setAddingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileInfo | null>(
    null,
  );
  const [deletingProfile, setDeletingProfile] = useState<ProfileInfo | null>(
    null,
  );

  const handleDeleteProfile = async () => {
    if (!deletingProfile) return;
    try {
      await rpcCall("profile:remove", { id: deletingProfile.id });
      useFavoritesStore.getState().removeByProfile(deletingProfile.id);
      await useVaultStore.getState().refreshProfiles();
      if (activeProfile?.id === deletingProfile.id) {
        switchProfile(null as unknown as ProfileInfo);
      }
      toast.success(`Profile "${deletingProfile.name}" deleted`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setDeletingProfile(null);
  };

  /* ── Collapsed sidebar ── */
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-border border-r bg-card">
        {/* Profile icons */}
        <div className="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2">
          {profiles.map((p) => {
            const isActive = p.id === activeProfile?.id;
            const ProviderIcon = providerIcon(p.provider);
            return (
              <div key={p.id} className="relative">
                {isActive && (
                  <div className="absolute top-1 -left-0.5 h-4 w-1 rounded-r-full bg-primary" />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={`transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                  title={p.name}
                  onClick={() => switchProfile(p)}
                >
                  <ProviderIcon className="size-4" />
                </Button>
              </div>
            );
          })}

          {/* Add profile */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-1 border border-foreground/20 border-dashed text-foreground/30 hover:border-primary/40 hover:text-primary/60"
            title="Add Profile"
            onClick={() => setAddingProfile(true)}
          >
            <IconPlus className="size-[11px]" />
          </Button>
        </div>

        {/* Active bucket indicator */}
        {selectedBucket && (
          <div
            className="mb-1 w-9 truncate text-center text-[10px] text-foreground/40"
            title={selectedBucket}
          >
            <IconBucket className="size-3 inline" />
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-1 border-border border-t py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground/40 hover:text-destructive"
            title="Lock Vault"
            onClick={lock}
          >
            <IconLock className="size-4" />
          </Button>
        </div>

        {/* Modals (shared) */}
        <Modal
          open={addingProfile}
          onClose={() => setAddingProfile(false)}
          title="Add Profile"
        >
          <ProfileForm onDone={() => setAddingProfile(false)} />
        </Modal>
      </aside>
    );
  }

  /* ── Expanded sidebar ── */
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-border border-r bg-card"
      style={{ width }}
    >
      {/* Header: profile */}
      <div className="flex items-center gap-2 border-border border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          {activeProfile ? (
            <div className="flex items-center gap-2.5">
              {(() => {
                const ProviderIcon = providerIcon(activeProfile.provider);
                return (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ProviderIcon className="size-4" />
                  </div>
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm leading-tight">
                  {activeProfile.name}
                </div>
                <div className="truncate text-[11px] text-foreground/40">
                  {PROVIDER_LABELS[activeProfile.provider]}
                  {selectedBucket && (
                    <>
                      <span className="mx-1">·</span>
                      <IconBucket className="mr-0.5 inline size-[10px]" />
                      {selectedBucket}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-foreground/40">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/20 border-dashed">
                <IconUser className="size-3" />
              </div>
              <span className="text-xs">Select a profile</span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable content area with favorites + profiles + buckets */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Favorites section (cross-profile pinned buckets) */}
        {favoriteEntries.length > 0 && (
          <div>
            <SectionHeader
              icon={<IconStar className="size-[11px]" />}
              label="Favorites"
              count={favoriteEntries.length}
            />
            <ul className="w-full px-1">
              {favoriteEntries.map((fav) => {
                const profile = profiles.find((p) => p.id === fav.profileId);
                const isActive =
                  activeProfile?.id === fav.profileId &&
                  selectedBucket === fav.bucket;
                return (
                  <li key={`${fav.profileId}:${fav.bucket}`}>
                    <div
                      className={`group/fav flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-sm ${
                        isActive ? "bg-muted" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 overflow-hidden rounded-sm px-1 py-1 hover:bg-muted"
                        onClick={() =>
                          selectFavoriteBucket(fav.profileId, fav.bucket)
                        }
                      >
                        <IconBucket className="size-3 shrink-0" />
                        <div className="min-w-0 flex-1 text-left">
                          <span className="block truncate">{fav.bucket}</span>
                          {profile && (
                            <span className="block truncate text-[11px] text-foreground/40">
                              {profile.name}
                            </span>
                          )}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-warning"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(fav.profileId, fav.bucket);
                        }}
                        title="Unpin bucket"
                      >
                        <IconStar className="size-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Profiles section */}
        <div>
          <SectionHeader
            icon={<IconUserGroup className="size-[11px]" />}
            label="Profiles"
            count={profiles.length}
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-foreground/40 hover:text-primary"
                onClick={() => setAddingProfile(true)}
                title="Add Profile"
              >
                <IconPlus className="size-[11px]" />
              </Button>
            }
          />
          <ProfileList
            profiles={profiles}
            activeId={activeProfile?.id ?? null}
            onSelect={switchProfile}
            onEdit={(p) => setEditingProfile(p)}
            onDelete={(p) => setDeletingProfile(p)}
          />
        </div>

        {/* Buckets section (when profile selected) */}
        {activeProfile && (
          <div className="mt-auto">
            <SectionHeader
              icon={<IconBucket className="size-[11px]" />}
              label="Buckets"
              count={buckets.length}
              action={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-foreground/40 hover:text-primary"
                  onClick={refreshBuckets}
                  title="Refresh Buckets"
                >
                  <IconArrowsRotate className="size-[11px]" />
                </Button>
              }
            />
            <BucketList
              buckets={buckets}
              loading={bucketsLoading}
              selectedBucket={selectedBucket}
              profileId={activeProfile?.id ?? null}
              onSelect={selectBucket}
            />
          </div>
        )}

        {/* Empty state when no profiles */}
        {profiles.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <IconCloudArrowUp className="size-5 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">No profiles yet</p>
              <p className="mt-0.5 text-foreground/50 text-xs">
                Add an S3-compatible profile to get started
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => setAddingProfile(true)}
            >
              <IconPlus className="size-3" /> Add Profile
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-border border-t px-3 py-2">
        <div className="text-[11px] text-foreground/35">
          {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
          {buckets.length > 0 && (
            <>
              {" "}
              · {buckets.length} bucket{buckets.length !== 1 ? "s" : ""}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground/40 hover:text-destructive"
            onClick={lock}
            title="Lock Vault"
          >
            <IconLock className="size-4" />
            <span className="text-[11px]">Lock</span>
          </Button>
        </div>
      </div>

      {/* Add Profile Modal */}
      <Modal
        open={addingProfile}
        onClose={() => setAddingProfile(false)}
        title="Add Profile"
      >
        <ProfileForm onDone={() => setAddingProfile(false)} />
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        open={!!editingProfile}
        onClose={() => setEditingProfile(null)}
        title="Edit Profile"
      >
        {editingProfile && (
          <ProfileForm
            editProfile={editingProfile}
            onDone={() => setEditingProfile(null)}
          />
        )}
      </Modal>

      {/* Delete Profile Confirmation */}
      <ConfirmDialog
        open={!!deletingProfile}
        title="Delete Profile"
        message={`Are you sure you want to delete "${deletingProfile?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmClass="btn-error"
        onConfirm={handleDeleteProfile}
        onClose={() => setDeletingProfile(null)}
      />
    </aside>
  );
}

/* ── Section header sub-component ── */
function SectionHeader({
  icon,
  label,
  count,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-border border-b bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-foreground/50">
        {icon}
        <span className="font-semibold text-[11px] uppercase tracking-wider">
          {label}
        </span>
        {count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-foreground/40 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Provider icon map ── */
type LucideIconComponent = React.ComponentType<{ className?: string }>;

function providerIcon(provider: string): LucideIconComponent {
  const map: Record<string, LucideIconComponent> = {
    aws: IconAws,
    r2: IconCloud,
    spaces: IconDigitalOcean,
    minio: IconServer,
    gcs: IconGoogle,
    backblaze: IconFire,
    custom: IconGear,
  };
  return map[provider] ?? IconCloud;
}
