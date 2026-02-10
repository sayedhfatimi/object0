import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { transitions } from "../../lib/animations";
import { type BrowserTab, useTabStore } from "../../stores/useTabStore";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);

  if (tabs.length === 0) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={transitions.fast}
      className="flex items-center gap-0 border-base-300 border-b bg-base-200/30"
    >
      <LayoutGroup>
        <div className="flex flex-1 items-center overflow-x-auto overflow-y-hidden">
          <AnimatePresence initial={false}>
            {tabs.map((tab) => (
              <TabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onActivate={() => setActiveTab(tab.id)}
                onClose={() => removeTab(tab.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </motion.div>
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
    <motion.div
      layout
      initial={{ opacity: 0, scaleX: 0.9 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.9 }}
      transition={transitions.fast}
      className={`group/tab relative flex max-w-52 shrink-0 items-center gap-1.5 border-base-300 border-r px-3 py-2 text-[11px] transition-colors ${
        isActive
          ? "bg-base-100 text-base-content"
          : "bg-base-200/50 text-base-content/60 hover:bg-base-200 hover:text-base-content"
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onClick={onActivate}
        title={`${tab.profileName} / ${tab.bucket}${tab.prefix ? `/${tab.prefix}` : ""}`}
      >
        <i className="fa-solid fa-bucket shrink-0 text-[11px]" />
        <span className="truncate">{label}</span>
      </button>

      <button
        type="button"
        className={`btn btn-ghost btn-sm h-6 min-h-0 w-6 p-0 transition-opacity ${
          isActive ? "opacity-75" : "opacity-55 group-hover/tab:opacity-100"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close tab"
        aria-label={`Close tab ${label}`}
      >
        <i className="fa-solid fa-xmark text-[11px]" />
      </button>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="active-tab-indicator"
          className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
          transition={transitions.spring}
        />
      )}
    </motion.div>
  );
}
