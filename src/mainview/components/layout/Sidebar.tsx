import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { ProfileInfo } from "../../../shared/profile.types";
import { PROVIDER_LABELS } from "../../../shared/profile.types";
import { useS3Buckets } from "../../hooks/useS3Buckets";
import { fadeVariants, transitions } from "../../lib/animations";
import { rpcCall } from "../../lib/rpc-client";
import { useFavoritesStore } from "../../stores/useFavoritesStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { BucketList } from "../buckets/BucketList";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";
import { ProfileForm } from "../profiles/ProfileForm";
import { ProfileList } from "../profiles/ProfileList";

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
      <motion.aside
        layout
        transition={transitions.spring}
        className="flex h-full w-12 shrink-0 flex-col items-center border-base-300 border-r bg-base-200"
      >
        {/* Profile icons */}
        <div className="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2">
          {profiles.map((p) => {
            const isActive = p.id === activeProfile?.id;
            return (
              <div key={p.id} className="relative">
                {isActive && (
                  <div className="absolute top-1 -left-0.5 h-4 w-1 rounded-r-full bg-primary" />
                )}
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm btn-square transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-base-content/60 hover:text-base-content"
                  }`}
                  title={p.name}
                  onClick={() => switchProfile(p)}
                >
                  <i className={providerIconCollapsed(p.provider)} />
                </button>
              </div>
            );
          })}

          {/* Add profile */}
          <button
            type="button"
            className="btn btn-ghost btn-square btn-sm mt-1 border border-base-content/20 border-dashed text-base-content/30 hover:border-primary/40 hover:text-primary/60"
            title="Add Profile"
            onClick={() => setAddingProfile(true)}
          >
            <i className="fa-solid fa-plus text-[11px]" />
          </button>
        </div>

        {/* Active bucket indicator */}
        <AnimatePresence>
          {selectedBucket && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={transitions.fast}
              className="mb-1 w-9 truncate text-center text-[10px] text-base-content/40"
              title={selectedBucket}
            >
              <i className="fa-solid fa-bucket fa-xs" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-1 border-base-300 border-t py-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square text-base-content/40 hover:text-error"
            title="Lock Vault"
            onClick={lock}
          >
            <i className="fa-solid fa-lock text-sm" />
          </button>
        </div>

        {/* Modals (shared) */}
        <Modal
          open={addingProfile}
          onClose={() => setAddingProfile(false)}
          title="Add Profile"
        >
          <ProfileForm onDone={() => setAddingProfile(false)} />
        </Modal>
      </motion.aside>
    );
  }

  /* ── Expanded sidebar ── */
  return (
    <motion.aside
      layout
      transition={transitions.spring}
      className="flex h-full shrink-0 flex-col border-base-300 border-r bg-base-200"
      style={{ width }}
    >
      {/* Header: profile */}
      <div className="flex items-center gap-2 border-base-300 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {activeProfile ? (
              <motion.div
                key={activeProfile.id}
                variants={fadeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={transitions.fast}
                className="flex items-center gap-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <i
                    className={providerIconCollapsed(activeProfile.provider)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm leading-tight">
                    {activeProfile.name}
                  </div>
                  <div className="truncate text-[11px] text-base-content/40">
                    {PROVIDER_LABELS[activeProfile.provider]}
                    {selectedBucket && (
                      <>
                        <span className="mx-1">·</span>
                        <i className="fa-solid fa-bucket mr-0.5 text-[10px]" />
                        {selectedBucket}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="no-profile"
                variants={fadeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={transitions.fast}
                className="flex items-center gap-2.5 text-base-content/40"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-base-content/20 border-dashed">
                  <i className="fa-solid fa-user text-xs" />
                </div>
                <span className="text-xs">Select a profile</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scrollable content area with favorites + profiles + buckets */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Favorites section (cross-profile pinned buckets) */}
        <AnimatePresence>
          {favoriteEntries.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={transitions.fast}
            >
              <SectionHeader
                icon="fa-solid fa-star"
                label="Favorites"
                count={favoriteEntries.length}
              />
              <ul className="menu menu-sm w-full px-1">
                {favoriteEntries.map((fav) => {
                  const profile = profiles.find((p) => p.id === fav.profileId);
                  const isActive =
                    activeProfile?.id === fav.profileId &&
                    selectedBucket === fav.bucket;
                  return (
                    <li key={`${fav.profileId}:${fav.bucket}`}>
                      <div
                        className={`group/fav flex w-full items-center gap-1 text-sm ${
                          isActive ? "active" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-2 overflow-hidden"
                          onClick={() =>
                            selectFavoriteBucket(fav.profileId, fav.bucket)
                          }
                        >
                          <i className="fa-solid fa-bucket shrink-0" />
                          <div className="min-w-0 flex-1 text-left">
                            <span className="block truncate">{fav.bucket}</span>
                            {profile && (
                              <span className="block truncate text-[11px] text-base-content/40">
                                {profile.name}
                              </span>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm shrink-0 text-warning"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(fav.profileId, fav.bucket);
                          }}
                          title="Unpin bucket"
                        >
                          <i className="fa-solid fa-star fa-xs" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Profiles section */}
        <div>
          <SectionHeader
            icon="fa-solid fa-user-group"
            label="Profiles"
            count={profiles.length}
            action={
              <button
                type="button"
                className="btn btn-ghost btn-sm text-base-content/40 hover:text-primary"
                onClick={() => setAddingProfile(true)}
                title="Add Profile"
              >
                <i className="fa-solid fa-plus text-[11px]" />
              </button>
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
        <AnimatePresence>
          {activeProfile && (
            <motion.div
              className="mt-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={transitions.fast}
            >
              <SectionHeader
                icon="fa-solid fa-bucket"
                label="Buckets"
                count={buckets.length}
                action={
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-base-content/40 hover:text-primary"
                    onClick={refreshBuckets}
                    title="Refresh Buckets"
                  >
                    <i className="fa-solid fa-arrows-rotate text-[11px]" />
                  </button>
                }
              />
              <BucketList
                buckets={buckets}
                loading={bucketsLoading}
                selectedBucket={selectedBucket}
                profileId={activeProfile?.id ?? null}
                onSelect={selectBucket}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state when no profiles */}
        {profiles.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <i className="fa-solid fa-cloud-arrow-up text-lg text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">No profiles yet</p>
              <p className="mt-0.5 text-base-content/50 text-xs">
                Add an S3-compatible profile to get started
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm btn-outline mt-1"
              onClick={() => setAddingProfile(true)}
            >
              <i className="fa-solid fa-plus" /> Add Profile
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-base-300 border-t px-3 py-2">
        <div className="text-[11px] text-base-content/35">
          {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
          {buckets.length > 0 && (
            <>
              {" "}
              · {buckets.length} bucket{buckets.length !== 1 ? "s" : ""}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm text-base-content/40 hover:text-error"
            onClick={lock}
            title="Lock Vault"
          >
            <i className="fa-solid fa-lock text-sm" />
            <span className="text-[11px]">Lock</span>
          </button>
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
    </motion.aside>
  );
}

/* ── Section header sub-component ── */
function SectionHeader({
  icon,
  label,
  count,
  action,
}: {
  icon: string;
  label: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-base-300 border-b bg-base-200 px-3 py-2">
      <div className="flex items-center gap-1.5 text-base-content/50">
        <i className={`${icon} text-[11px]`} />
        <span className="font-semibold text-[11px] uppercase tracking-wider">
          {label}
        </span>
        {count > 0 && (
          <span className="rounded-full bg-base-300 px-1.5 py-px text-[10px] text-base-content/40 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function providerIconCollapsed(provider: string): string {
  const map: Record<string, string> = {
    aws: "fa-brands fa-aws text-warning",
    r2: "fa-solid fa-cloud text-accent",
    spaces: "fa-brands fa-digital-ocean text-info",
    minio: "fa-solid fa-server text-error",
    gcs: "fa-brands fa-google text-success",
    backblaze: "fa-solid fa-fire text-base-content",
    custom: "fa-solid fa-gear text-base-content/60",
  };
  return map[provider] ?? "fa-solid fa-cloud";
}
