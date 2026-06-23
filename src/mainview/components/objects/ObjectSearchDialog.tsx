import { useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { IconFile, IconFolder, IconMagnifyingGlass } from "@/lib/icons";
import { useS3Objects } from "../../hooks/useS3Objects";
import { getFileName } from "../../lib/formatters";
import { useBucketStore } from "../../stores/useBucketStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";

/**
 * Centered command-palette overlay for searching objects in the current view.
 * Folders navigate; files open the detail panel. A "filter" item applies the
 * typed term to the live table filter.
 */
export function ObjectSearchDialog() {
  const open = useUIStore((s) => s.objectSearchOpen);
  const setOpen = useUIStore((s) => s.setObjectSearchOpen);
  const setDetailKey = useUIStore((s) => s.setDetailKey);
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const { objects, prefixes, navigate, setFilters } = useS3Objects();

  const [query, setQuery] = useState("");

  // Reset the query each time the overlay opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Ctrl/Cmd+F opens the overlay (only when a bucket is in view).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (!profileId || !bucket) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [profileId, bucket, setOpen]);

  const folderName = (prefix: string) =>
    prefix.split("/").filter(Boolean).pop() ?? prefix;

  const trimmed = query.trim();

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search objects"
      description="Search files and folders in the current view"
    >
      <Command
        // cmdk filters by item value; folder/file values include their names.
        filter={(value, search) =>
          value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
        }
      >
        <CommandInput
          placeholder="Search files and folders…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No matching objects</CommandEmpty>

          {trimmed && (
            <CommandGroup heading="Actions">
              <CommandItem
                value={`__filter__ ${trimmed}`}
                onSelect={() => {
                  setFilters({ search: trimmed });
                  setOpen(false);
                }}
              >
                <IconMagnifyingGlass className="size-4" />
                <span className="flex-1">
                  Filter current view by “{trimmed}”
                </span>
              </CommandItem>
            </CommandGroup>
          )}

          {prefixes.length > 0 && (
            <CommandGroup heading="Folders">
              {prefixes.map((p) => (
                <CommandItem
                  key={p.prefix}
                  value={`folder ${folderName(p.prefix)}`}
                  onSelect={() => {
                    navigate(p.prefix);
                    setOpen(false);
                  }}
                >
                  <IconFolder className="size-4 text-warning" />
                  <span className="flex-1 truncate">
                    {folderName(p.prefix)}/
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {objects.length > 0 && (
            <CommandGroup heading="Files">
              {objects.map((o) => (
                <CommandItem
                  key={o.key}
                  value={`file ${getFileName(o.key)}`}
                  onSelect={() => {
                    setDetailKey(o.key);
                    setOpen(false);
                  }}
                >
                  <IconFile className="size-4 text-foreground/60" />
                  <span className="flex-1 truncate">{getFileName(o.key)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
