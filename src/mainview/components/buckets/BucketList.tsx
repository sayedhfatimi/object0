import type { BucketInfo } from "@shared/s3.types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconBucket, IconStar } from "@/lib/icons";
import { useFavoritesStore } from "../../stores/useFavoritesStore";

interface BucketListProps {
  buckets: BucketInfo[];
  loading: boolean;
  selectedBucket: string | null;
  profileId: string | null;
  onSelect: (bucket: string) => void;
}

export function BucketList({
  buckets,
  loading,
  selectedBucket,
  profileId,
  onSelect,
}: BucketListProps) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);

  if (loading) {
    return (
      <div className="space-y-1 px-2 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
            key={`skel-${i}`}
            className="flex items-center gap-2 rounded px-2 py-1.5"
          >
            <Skeleton className="h-3 w-3 rounded" />
            <Skeleton className="h-3 flex-1 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-muted-foreground/60 text-xs">
        No buckets found
      </div>
    );
  }

  const isFav = (name: string) =>
    profileId ? favorites.has(`${profileId}:${name}`) : false;

  const pinned = buckets.filter((b) => isFav(b.name));
  const unpinned = buckets.filter((b) => !isFav(b.name));

  const renderBucket = (b: BucketInfo, showStar: boolean) => (
    <li key={b.name}>
      <div
        className={`group/bucket flex w-full items-center gap-1 rounded-none text-sm ${b.name === selectedBucket ? "bg-accent text-accent-foreground" : ""}`}
      >
        <button
          type="button"
          title={b.name}
          className="flex flex-1 items-center gap-2 overflow-hidden rounded-none px-3 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
          onClick={() => onSelect(b.name)}
        >
          <IconBucket className="size-3.5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {b.name}
          </span>
        </button>
        {profileId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`size-6 shrink-0 group-data-[collapsible=icon]:hidden ${
              showStar
                ? "text-warning"
                : "opacity-0 group-hover/bucket:opacity-100 text-muted-foreground"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(profileId, b.name);
            }}
            title={showStar ? "Unpin bucket" : "Pin bucket"}
          >
            <IconStar className={`size-3 ${showStar ? "fill-current" : ""}`} />
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <ul className="w-full px-0">
      {/* Pinned section */}
      {pinned.length > 0 && (
        <>
          <li className="flex items-center gap-1 px-3 py-1 text-[10px] text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
            <IconStar className="size-2.5" />
            Pinned
          </li>
          {pinned.map((b) => renderBucket(b, true))}
          {unpinned.length > 0 && (
            <li className="px-3 py-1 text-[10px] text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
              All Buckets
            </li>
          )}
        </>
      )}
      {/* Regular buckets */}
      {unpinned.map((b) => renderBucket(b, false))}
    </ul>
  );
}
