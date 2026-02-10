import { AnimatePresence, motion } from "framer-motion";
import type { BucketInfo } from "../../../shared/s3.types";
import { staggerItemVariants, transitions } from "../../lib/animations";
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
            <div className="skeleton h-3 w-3 rounded" />
            <div className="skeleton h-3 flex-1 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-base-content/40 text-xs">
        No buckets found
      </div>
    );
  }

  const isFav = (name: string) =>
    profileId ? favorites.has(`${profileId}:${name}`) : false;

  const pinned = buckets.filter((b) => isFav(b.name));
  const unpinned = buckets.filter((b) => !isFav(b.name));

  const renderBucket = (b: BucketInfo, showStar: boolean) => (
    <motion.li
      key={b.name}
      layout
      variants={staggerItemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transitions.spring}
    >
      <div
        className={`group/bucket flex w-full items-center gap-1 text-sm ${b.name === selectedBucket ? "active" : ""}`}
      >
        <button
          type="button"
          className="flex flex-1 items-center gap-2 overflow-hidden"
          onClick={() => onSelect(b.name)}
        >
          <i className="fa-solid fa-bucket shrink-0" />
          <span className="truncate">{b.name}</span>
        </button>
        {profileId && (
          <button
            type="button"
            className={`btn btn-ghost btn-xs shrink-0 ${
              showStar
                ? "text-warning"
                : "opacity-0 group-hover/bucket:opacity-100"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(profileId, b.name);
            }}
            title={showStar ? "Unpin bucket" : "Pin bucket"}
          >
            <i
              className={`${showStar ? "fa-solid" : "fa-regular"} fa-star fa-xs`}
            />
          </button>
        )}
      </div>
    </motion.li>
  );

  return (
    <ul className="menu menu-sm w-full px-1">
      {/* Pinned section */}
      <AnimatePresence>
        {pinned.length > 0 && (
          <>
            <li className="menu-title text-[10px] text-base-content/40">
              <span>
                <i className="fa-solid fa-star fa-xs mr-1" />
                Pinned
              </span>
            </li>
            {pinned.map((b) => renderBucket(b, true))}
            {unpinned.length > 0 && (
              <li className="menu-title text-[10px] text-base-content/40">
                <span>All Buckets</span>
              </li>
            )}
          </>
        )}
      </AnimatePresence>
      {/* Regular buckets */}
      <AnimatePresence>
        {unpinned.map((b) => renderBucket(b, false))}
      </AnimatePresence>
    </ul>
  );
}
