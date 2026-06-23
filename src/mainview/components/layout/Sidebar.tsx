import type { ProfileInfo } from "@shared/profile.types";
import { PROVIDER_LABELS } from "@shared/profile.types";
import { useMemo, useState } from "react";
import { useS3Buckets } from "@/hooks";
import {
  IconArrowsRotate,
  IconAws,
  IconBucket,
  IconCloud,
  IconCloudArrowUp,
  IconDigitalOcean,
  IconFire,
  IconGear,
  IconGoogle,
  IconLock,
  IconPlus,
  IconServer,
  IconStar,
  IconUser,
  IconUserGroup,
} from "@/lib/icons";
import { rpcCall } from "@/lib/rpc-client";
import { useFavoritesStore, useVaultStore } from "@/stores";
import { BucketList } from "../buckets/BucketList";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { toast } from "../common/Toast";
import { ProfileForm } from "../profiles/ProfileForm";
import { ProfileList } from "../profiles/ProfileList";
import { Button } from "../ui/button";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  SidebarRail,
  SidebarTrigger,
} from "../ui/sidebar";

export function Sidebar() {
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

  return (
    <SidebarPrimitive collapsible="icon">
      {/* ── Header: active profile summary + collapse toggle ── */}
      <SidebarHeader className="border-border border-b px-2 py-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
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
          <SidebarTrigger className="size-7 shrink-0 rounded-none text-foreground/50 hover:text-foreground" />
        </div>
      </SidebarHeader>

      {/* ── Scrollable content ── */}
      <SidebarContent>
        {/* Favorites section */}
        {favoriteEntries.length > 0 && (
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="sticky top-0 z-10 flex items-center justify-between rounded-none border-border border-b bg-card px-3 text-foreground/50 group-data-[collapsible=icon]:pointer-events-none">
              <div className="flex items-center gap-1.5">
                <IconStar className="size-[11px]" />
                <span className="font-semibold text-[11px] uppercase tracking-wider">
                  Favorites
                </span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-foreground/40 tabular-nums">
                  {favoriteEntries.length}
                </span>
              </div>
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0 px-0">
              {favoriteEntries.map((fav) => {
                const profile = profiles.find((p) => p.id === fav.profileId);
                const isActive =
                  activeProfile?.id === fav.profileId &&
                  selectedBucket === fav.bucket;
                return (
                  <SidebarMenuItem key={`${fav.profileId}:${fav.bucket}`}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={fav.bucket}
                      className="h-auto rounded-none px-3 py-1.5 group-data-[collapsible=icon]:h-auto! group-data-[collapsible=icon]:w-full! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2!"
                      onClick={() =>
                        selectFavoriteBucket(fav.profileId, fav.bucket)
                      }
                    >
                      <IconBucket className="size-3 shrink-0" />
                      <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                        <span className="block truncate">{fav.bucket}</span>
                        {profile && (
                          <span className="block truncate text-[11px] text-foreground/40">
                            {profile.name}
                          </span>
                        )}
                      </div>
                    </SidebarMenuButton>
                    <SidebarGroupAction
                      title="Unpin bucket"
                      className="group/fav-star top-1/2 right-3 -translate-y-1/2 text-warning"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(fav.profileId, fav.bucket);
                      }}
                    >
                      <IconStar className="size-3 fill-current group-hover/fav-star:fill-none" />
                    </SidebarGroupAction>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Profiles section */}
        <SidebarGroup className="p-0 group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:border-border group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:pt-1">
          <SidebarGroupLabel className="sticky top-0 z-10 flex items-center justify-between rounded-none border-border border-b bg-card px-3 text-foreground/50 group-data-[collapsible=icon]:pointer-events-none">
            <div className="flex items-center gap-1.5">
              <IconUserGroup className="size-[11px]" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">
                Profiles
              </span>
              {profiles.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-foreground/40 tabular-nums">
                  {profiles.length}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-foreground/40 hover:text-primary group-data-[collapsible=icon]:hidden"
              onClick={() => setAddingProfile(true)}
              title="Add Profile"
            >
              <IconPlus className="size-[11px]" />
            </Button>
          </SidebarGroupLabel>

          {/* Profile list — rendered as SidebarMenu items */}
          {profiles.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-4 group-data-[collapsible=icon]:hidden">
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
          ) : (
            <ProfileList
              profiles={profiles}
              activeId={activeProfile?.id ?? null}
              onSelect={switchProfile}
              onEdit={(p) => setEditingProfile(p)}
              onDelete={(p) => setDeletingProfile(p)}
            />
          )}
        </SidebarGroup>

        {/* Buckets section (when profile selected) — pinned to the bottom */}
        {activeProfile && (
          <SidebarGroup className="mt-auto p-0 group-data-[collapsible=icon]:border-border group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:pt-1">
            <SidebarGroupLabel className="sticky top-0 z-10 flex items-center justify-between rounded-none border-border border-b bg-card px-3 text-foreground/50 group-data-[collapsible=icon]:pointer-events-none">
              <div className="flex items-center gap-1.5">
                <IconBucket className="size-[11px]" />
                <span className="font-semibold text-[11px] uppercase tracking-wider">
                  Buckets
                </span>
                {buckets.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-foreground/40 tabular-nums">
                    {buckets.length}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-foreground/40 hover:text-primary group-data-[collapsible=icon]:hidden"
                onClick={refreshBuckets}
                title="Refresh Buckets"
              >
                <IconArrowsRotate className="size-[11px]" />
              </Button>
            </SidebarGroupLabel>
            <BucketList
              buckets={buckets}
              loading={bucketsLoading}
              selectedBucket={selectedBucket}
              profileId={activeProfile?.id ?? null}
              onSelect={selectBucket}
            />
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer: profile count + lock ── */}
      <SidebarFooter className="h-8 justify-center border-border border-t px-3 py-0">
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
          <div className="text-[11px] text-foreground/35 group-data-[collapsible=icon]:hidden">
            {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
            {buckets.length > 0 && (
              <>
                {" "}
                · {buckets.length} bucket{buckets.length !== 1 ? "s" : ""}
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground/40 hover:text-destructive"
            onClick={lock}
            title="Lock Vault"
          >
            <IconLock className="size-4" />
            <span className="text-[11px] group-data-[collapsible=icon]:hidden">
              Lock
            </span>
          </Button>
        </div>
      </SidebarFooter>

      {/* Click-to-resize rail */}
      <SidebarRail />

      {/* ── Modals ── */}
      <ProfileForm
        open={addingProfile}
        onClose={() => setAddingProfile(false)}
      />

      {/* Mounted per-profile so the form initializes from the edited profile. */}
      {editingProfile && (
        <ProfileForm
          key={editingProfile.id}
          open
          editProfile={editingProfile}
          onClose={() => setEditingProfile(null)}
        />
      )}

      <ConfirmDialog
        open={!!deletingProfile}
        title="Delete Profile"
        message={`Are you sure you want to delete "${deletingProfile?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteProfile}
        onClose={() => setDeletingProfile(null)}
      />
    </SidebarPrimitive>
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
