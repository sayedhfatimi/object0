import { type BrowserTab, useTabStore } from "../../stores/useTabStore";
import { Button } from "../ui/button";
import { IconBucket, IconXmark } from "../../lib/icons";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-0 border-border border-b bg-card/30">
      <div className="flex flex-1 items-center overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onActivate={() => setActiveTab(tab.id)}
            onClose={() => removeTab(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  onActivate,
  onClose,
}: {
  tab: BrowserTab;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const label = tab.prefix
    ? `${tab.bucket}/${tab.prefix.split("/").filter(Boolean).pop()}`
    : tab.bucket;

  return (
    <div
      className={`group/tab relative flex max-w-52 shrink-0 items-center gap-1.5 border-border border-r px-3 py-2 text-[11px] transition-colors ${
        isActive
          ? "bg-background text-foreground"
          : "bg-card/50 text-foreground/60 hover:bg-card hover:text-foreground"
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onClick={onActivate}
        title={`${tab.profileName} / ${tab.bucket}${tab.prefix ? `/${tab.prefix}` : ""}`}
      >
        <IconBucket className="size-[11px] shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      <Button
        variant="ghost"
        size="icon-xs"
        className={`transition-opacity ${
          isActive ? "opacity-75" : "opacity-55 group-hover/tab:opacity-100"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close tab"
        aria-label={`Close tab ${label}`}
      >
        <IconXmark className="size-[11px]" />
      </Button>

      {/* Active indicator */}
      {isActive && (
        <div className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
      )}
    </div>
  );
}
