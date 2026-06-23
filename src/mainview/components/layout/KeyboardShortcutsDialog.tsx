import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconKeyboard } from "@/lib/icons";

const SHORTCUTS: { combo: string; label: string }[] = [
  { combo: "Ctrl+K", label: "Command Palette" },
  { combo: "Ctrl+B", label: "Toggle Sidebar" },
  { combo: "Ctrl+J", label: "Toggle Job Panel" },
  { combo: "Ctrl+\\", label: "Toggle Theme" },
  { combo: "Ctrl+,", label: "Open Settings" },
  { combo: "↑ / ↓", label: "Navigate rows" },
  { combo: "Space", label: "Toggle selection" },
  { combo: "Enter", label: "Open folder" },
  { combo: "F2", label: "Rename file" },
  { combo: "Ctrl+A", label: "Select all" },
  { combo: "Esc", label: "Clear selection" },
  { combo: "Backspace", label: "Go back" },
];

export function KeyboardShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="no-drag"
            title="Keyboard Shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <IconKeyboard className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Quick reference for available keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-foreground/60">{s.label}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                {s.combo}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
