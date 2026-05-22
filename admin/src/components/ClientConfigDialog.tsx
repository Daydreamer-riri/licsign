import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { ClientIntegrationConfig } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shows the client-integration config for a product as copy-pasteable JSON.
 * The admin hands this to whoever integrates a client against the product.
 */
export function ClientConfigDialog({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}) {
  const [config, setConfig] = useState<ClientIntegrationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setConfig(null);
    api
      .get<ClientIntegrationConfig>(
        `/api/admin/products/${productId}/client-config`,
      )
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load client config.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  const json = config ? JSON.stringify(config, null, 2) : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success("Client config copied to clipboard");
    } catch {
      toast.error("Could not copy — select the text and copy it manually.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Client Config</DialogTitle>
          <DialogDescription>
            Every value a client integrator needs to activate against and verify
            this product. See docs/client-integration.md §2.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Spinner />
            Loading…
          </div>
        )}

        {error && (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {config && (
          <div className="flex flex-col gap-3">
            <pre
              className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs"
              translate="no"
            >
              {json}
            </pre>
            <p className="text-xs text-muted-foreground">
              Includes only the current signing key. After a key rotation, add
              the previous key(s) to <code>signing_keys</code> by hand so older
              tokens still verify.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button type="button" onClick={handleCopy} disabled={!config}>
            <CopyIcon data-icon="inline-start" />
            Copy JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
