import type { ProfileInfo } from "@shared/profile.types";
import { IconBucket, IconStar } from "@/lib/icons";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";

interface FavoriteEntry {
  profileId: string;
  bucket: string;
}

interface SidebarFavoritesProps {
  entries: FavoriteEntry[];
  profiles: ProfileInfo[];
  activeProfileId: string | null;
  selectedBucket: string | null;
  onSelect: (profileId: string, bucket: string) => void;
  onToggleFavorite: (profileId: string, bucket: string) => void;
}

export function SidebarFavorites({
  entries,
  profiles,
  activeProfileId,
  selectedBucket,
  onSelect,
  onToggleFavorite,
}: SidebarFavoritesProps) {
  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="sticky top-0 z-10 flex items-center justify-between rounded-none border-border border-b bg-card px-3 text-foreground/50 group-data-[collapsible=icon]:pointer-events-none">
        <div className="flex items-center gap-1.5">
          <IconStar className="size-[11px]" />
          <span className="font-semibold text-[11px] uppercase tracking-wider">
            Favorites
          </span>
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-foreground/40 tabular-nums">
            {entries.length}
          </span>
        </div>
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0 px-0">
        {entries.map((fav) => {
          const profile = profiles.find((p) => p.id === fav.profileId);
          const isActive =
            activeProfileId === fav.profileId && selectedBucket === fav.bucket;
          return (
            <SidebarMenuItem key={`${fav.profileId}:${fav.bucket}`}>
              <SidebarMenuButton
                isActive={isActive}
                tooltip={fav.bucket}
                className="h-auto rounded-none px-3 py-1.5 group-data-[collapsible=icon]:h-auto! group-data-[collapsible=icon]:w-full! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2!"
                onClick={() => onSelect(fav.profileId, fav.bucket)}
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
                  onToggleFavorite(fav.profileId, fav.bucket);
                }}
              >
                <IconStar className="size-3 fill-current group-hover/fav-star:fill-none" />
              </SidebarGroupAction>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
