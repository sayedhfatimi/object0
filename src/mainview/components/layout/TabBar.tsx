import { IconBucket, IconXmark } from "../../lib/icons";
import { useTabStore } from "../../stores/useTabStore";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-border border-b bg-card/30">
      <Tabs
        value={activeTabId ?? undefined}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList
          variant="line"
          className="h-auto w-full justify-start rounded-none bg-transparent p-0 overflow-x-auto overflow-y-hidden"
        >
          {tabs.map((tab) => {
            const label = tab.prefix
              ? `${tab.bucket}/${tab.prefix.split("/").filter(Boolean).pop()}`
              : tab.bucket;
            const isActive = tab.id === activeTabId;

            return (
              // Outer div groups the trigger + close button; close is a sibling
              // of TabsTrigger — NOT nested inside it (avoids button-in-button).
              <div
                key={tab.id}
                className={`group/tab relative flex max-w-52 shrink-0 items-center border-border border-r text-[11px] transition-colors ${
                  isActive
                    ? "bg-background text-foreground"
                    : "bg-card/50 text-foreground/60 hover:bg-card hover:text-foreground"
                }`}
              >
                <TabsTrigger
                  value={tab.id}
                  title={`${tab.profileName} / ${tab.bucket}${tab.prefix ? `/${tab.prefix}` : ""}`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-none border-none px-3 py-2 text-[11px] data-active:bg-transparent data-active:shadow-none after:hidden"
                >
                  <IconBucket className="size-[11px] shrink-0" />
                  <span className="truncate">{label}</span>
                </TabsTrigger>

                {/* Close button is a sibling, not nested inside TabsTrigger */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={`mr-1.5 shrink-0 transition-opacity ${
                    isActive
                      ? "opacity-75"
                      : "opacity-55 group-hover/tab:opacity-100"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
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
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
