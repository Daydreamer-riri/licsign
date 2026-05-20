import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { Product } from "@/lib/types";
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

/** Create-only dialog. Trial settings are configured later in product settings. */
export function ProductFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxDevices, setMaxDevices] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCode("");
    setName("");
    setDescription("");
    setMaxDevices("1");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Product>("/api/admin/products", {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        default_max_devices: Number(maxDevices) || 1,
      });
      toast.success("Product created");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create product.",
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
          <DialogTitle>New Product</DialogTitle>
          <DialogDescription>
            Add a licensable product to this issuer.
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
              <FieldLabel htmlFor="product-code">Code</FieldLabel>
              <Input
                id="product-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                spellCheck={false}
                autoComplete="off"
                placeholder="my-app-tv"
              />
              <FieldDescription>
                Letters, numbers, dashes, and underscores.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="product-name">Name</FieldLabel>
              <Input
                id="product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="My App for TV"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-description">Description</FieldLabel>
              <Textarea
                id="product-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional summary…"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-max-devices">
                Default device limit
              </FieldLabel>
              <Input
                id="product-max-devices"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={maxDevices}
                onChange={(e) => setMaxDevices(e.target.value)}
                required
              />
              <FieldDescription>
                Devices each license from this product may activate.
              </FieldDescription>
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
              {submitting ? "Creating…" : "Create Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
