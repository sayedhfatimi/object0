import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconChevronDown, IconClock, IconCopy, IconQrcode } from "@/lib/icons";

interface ShareResultProps {
  url: string;
  expiresLabel: string;
  showQR: boolean;
  onCopy: () => void;
  onToggleQR: () => void;
}

export function ShareResult({
  url,
  expiresLabel,
  showQR,
  onCopy,
  onToggleQR,
}: ShareResultProps) {
  return (
    <>
      {/* Generated URL */}
      <div className="space-y-2">
        <span className="font-semibold text-foreground/70 text-xs">
          Shareable Link
        </span>
        <div className="flex gap-2">
          <Input
            type="text"
            readOnly
            value={url}
            className="h-7 flex-1 font-mono text-xs"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onCopy}
            title="Copy to clipboard"
          >
            <IconCopy className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Expiration info */}
      <div className="flex items-center gap-2 text-foreground/70 text-sm">
        <IconClock className="size-4" />
        <span>Expires in {expiresLabel}</span>
      </div>

      {/* QR Code toggle */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onToggleQR}
        >
          {showQR ? (
            <>
              <IconChevronDown className="size-3.5 mr-1" />
              Hide QR Code
            </>
          ) : (
            <>
              <IconQrcode className="size-3.5 mr-1" />
              Show QR Code
            </>
          )}
        </Button>

        {showQR && (
          <div className="flex justify-center rounded bg-white p-4">
            <QRCodeSVG value={url} size={200} level="M" includeMargin />
          </div>
        )}
      </div>
    </>
  );
}
