import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/** Generates a batch of activation codes for one product. */
export function BatchFormDialog({
  open,
  onOpenChange,
  productId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onCreated: (batchId: string) => void;
}) {
  const [batchName, setBatchName] = useState("");
  const [quantity, setQuantity] = useState("50");
  const [codePrefix, setCodePrefix] = useState("");
  const [maxDevices, setMaxDevices] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setBatchName("");
    setQuantity("50");
    setCodePrefix("");
    setMaxDevices("");
    setExpiresAt("");
    setNotes("");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        product_id: productId,
        batch_name: batchName.trim(),
        quantity: Number(quantity) || 1,
      };
      if (codePrefix.trim()) body.code_prefix = codePrefix.trim().toUpperCase();
      if (maxDevices.trim()) body.max_devices = Number(maxDevices);
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      if (notes.trim()) body.notes = notes.trim();

      const result = await api.post<{ id: string }>("/api/admin/batches", body);
      toast.success(`Batch created with ${Number(quantity) || 1} codes`);
      reset();
      onOpenChange(false);
      onCreated(result.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create batch.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Batch</DialogTitle>
          <DialogDescription>
            Generate a batch of activation codes for this product.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <Alert variant="destructive" aria-live="polite">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="batch-name">Batch name</FieldLabel>
              <Input
                id="batch-name"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                required
                placeholder="Spring 2026 resellers"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="batch-quantity">Quantity</FieldLabel>
                <Input
                  id="batch-quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={5000}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="batch-prefix">Code prefix</FieldLabel>
                <Input
                  id="batch-prefix"
                  value={codePrefix}
                  onChange={(e) => setCodePrefix(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Optional, e.g. SPRING"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="batch-max-devices">Device limit</FieldLabel>
                <Input
                  id="batch-max-devices"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={maxDevices}
                  onChange={(e) => setMaxDevices(e.target.value)}
                  placeholder="Product default"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="batch-expires">Expires at</FieldLabel>
                <Input
                  id="batch-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="batch-notes">Notes</FieldLabel>
              <Textarea
                id="batch-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional internal notes…"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? "Creating…" : "Create Batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
