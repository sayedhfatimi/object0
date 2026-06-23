import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  IconAws,
  IconCloud,
  IconDigitalOcean,
  IconFire,
  IconGear,
  IconGoogle,
  IconPenToSquare,
  IconServer,
  IconTrashCan,
} from "@/lib/icons";
import type { ProfileInfo } from "../../../shared/profile.types";
import { PROVIDER_LABELS } from "../../../shared/profile.types";

interface ProfileListProps {
  profiles: ProfileInfo[];
  activeId: string | null;
  onSelect: (profile: ProfileInfo) => void;
  onEdit: (profile: ProfileInfo) => void;
  onDelete: (profile: ProfileInfo) => void;
}

export function ProfileList({
  profiles,
  activeId,
  onSelect,
  onEdit,
  onDelete,
}: ProfileListProps) {
  if (profiles.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-muted-foreground/60 text-xs">
        No profiles yet. Click + to add one.
      </div>
    );
  }

  return (
    <ul className="w-full px-0">
      {profiles.map((p) => (
        <ContextMenu key={p.id}>
          <ContextMenuPrimitive.Trigger
            data-slot="context-menu-trigger"
            className="select-none w-full"
            render={<li />}
          >
            <button
              type="button"
              title={p.name}
              className={`flex w-full items-center gap-2 rounded-none px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 ${
                p.id === activeId
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground"
              }`}
              onClick={() => onSelect(p)}
            >
              <span className="text-base shrink-0">
                <ProviderIcon provider={p.provider} />
              </span>
              <div className="flex min-w-0 flex-col items-start group-data-[collapsible=icon]:hidden">
                <span className="w-full truncate font-medium text-sm">
                  {p.name}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] leading-tight ${providerBadge(p.provider)}`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${providerDot(p.provider)}`}
                  />
                  {PROVIDER_LABELS[p.provider]}
                </span>
              </div>
            </button>
          </ContextMenuPrimitive.Trigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onEdit(p)}>
              <IconPenToSquare className="size-3.5 shrink-0" /> Edit
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => onDelete(p)}>
              <IconTrashCan className="size-3.5 shrink-0" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </ul>
  );
}

function ProviderIcon({ provider }: { provider: ProfileInfo["provider"] }) {
  switch (provider) {
    case "aws":
      return <IconAws className="size-4 text-warning" />;
    case "r2":
      return <IconCloud className="size-4 text-info" />;
    case "spaces":
      return <IconDigitalOcean className="size-4 text-info" />;
    case "minio":
      return <IconServer className="size-4 text-destructive" />;
    case "gcs":
      return <IconGoogle className="size-4 text-success" />;
    case "backblaze":
      return <IconFire className="size-4 text-foreground" />;
    case "custom":
      return <IconGear className="size-4 text-muted-foreground" />;
    default:
      return <IconCloud className="size-4" />;
  }
}

function providerBadge(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "bg-warning/10 text-warning",
    r2: "bg-info/10 text-info",
    spaces: "bg-info/10 text-info",
    minio: "bg-destructive/10 text-destructive",
    gcs: "bg-success/10 text-success",
    backblaze: "bg-foreground/10 text-foreground/60",
    custom: "bg-foreground/5 text-foreground/40",
  };
  return map[provider] ?? "bg-foreground/5 text-foreground/40";
}

function providerDot(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "bg-warning",
    r2: "bg-info",
    spaces: "bg-info",
    minio: "bg-destructive",
    gcs: "bg-success",
    backblaze: "bg-foreground",
    custom: "bg-foreground/40",
  };
  return map[provider] ?? "bg-foreground/40";
}
