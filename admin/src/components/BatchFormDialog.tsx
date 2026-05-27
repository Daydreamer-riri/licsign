import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type ValidityMode = "perpetual" | "absolute" | "relative";
type ValidityUnit = "days" | "years";

const SECONDS_PER_DAY = 60 * 60 * 24;
// Match shared/src/schemas.ts year arithmetic exactly (365-day "year").
const SECONDS_PER_YEAR = SECONDS_PER_DAY * 365;
const VALIDITY_DURATION_MIN_SECONDS = SECONDS_PER_DAY;
const VALIDITY_DURATION_MAX_SECONDS = SECONDS_PER_YEAR * 100;

function toSeconds(amount: number, unit: ValidityUnit): number {
  return unit === "years" ? amount * SECONDS_PER_YEAR : amount * SECONDS_PER_DAY;
}

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
  const [validityMode, setValidityMode] = useState<ValidityMode>("perpetual");
  const [absoluteExpiresAt, setAbsoluteExpiresAt] = useState("");
  const [relativeAmount, setRelativeAmount] = useState("1");
  const [relativeUnit, setRelativeUnit] = useState<ValidityUnit>("years");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setBatchName("");
    setQuantity("50");
    setCodePrefix("");
    setMaxDevices("");
    setValidityMode("perpetual");
    setAbsoluteExpiresAt("");
    setRelativeAmount("1");
    setRelativeUnit("years");
    setNotes("");
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const body: Record<string, unknown> = {
      product_id: productId,
      batch_name: batchName.trim(),
      quantity: Number(quantity) || 1,
    };
    if (codePrefix.trim()) body.code_prefix = codePrefix.trim().toUpperCase();
    if (maxDevices.trim()) body.max_devices = Number(maxDevices);
    if (notes.trim()) body.notes = notes.trim();

    if (validityMode === "absolute") {
      if (!absoluteExpiresAt) {
        setError("Pick an expiry date or switch to another validity mode.");
        return;
      }
      const parsed = new Date(absoluteExpiresAt);
      if (Number.isNaN(parsed.getTime())) {
        setError("Expiry date is not a valid date/time.");
        return;
      }
      body.expires_at = parsed.toISOString();
    } else if (validityMode === "relative") {
      const amount = Math.floor(Number(relativeAmount));
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Enter a positive whole-number duration.");
        return;
      }
      const seconds = toSeconds(amount, relativeUnit);
      if (
        seconds < VALIDITY_DURATION_MIN_SECONDS ||
        seconds > VALIDITY_DURATION_MAX_SECONDS
      ) {
        setError("Duration must be between 1 day and 100 years.");
        return;
      }
      body.validity_duration_seconds = seconds;
    }

    setSubmitting(true);
    try {
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
            </div>
            <FieldSet>
              <FieldLegend variant="label">Validity</FieldLegend>
              <FieldDescription>
                When the License expires. Activation-relative starts counting at
                first activation.
              </FieldDescription>
              <RadioGroup
                value={validityMode}
                onValueChange={(value) =>
                  setValidityMode(value as ValidityMode)
                }
                className="gap-2"
              >
                <FieldLabel htmlFor="validity-perpetual">
                  <Field orientation="horizontal">
                    <RadioGroupItem
                      id="validity-perpetual"
                      value="perpetual"
                    />
                    <span>Perpetual — never expires</span>
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="validity-absolute">
                  <Field orientation="horizontal">
                    <RadioGroupItem id="validity-absolute" value="absolute" />
                    <span>Absolute expiry — fixed cutoff date</span>
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="validity-relative">
                  <Field orientation="horizontal">
                    <RadioGroupItem id="validity-relative" value="relative" />
                    <span>Activation-relative — valid for a duration</span>
                  </Field>
                </FieldLabel>
              </RadioGroup>
              <div
                className={cn(
                  "overflow-hidden transition-[height] duration-200 ease-out",
                  validityMode === "perpetual" && "h-0",
                  validityMode === "absolute" && "h-[76px]",
                  validityMode === "relative" && "h-[108px]",
                )}
                aria-hidden={validityMode === "perpetual"}
              >
                {validityMode === "absolute" && (
                  <Field className="pt-2">
                    <FieldLabel htmlFor="batch-expires">Expires at</FieldLabel>
                    <Input
                      id="batch-expires"
                      type="datetime-local"
                      value={absoluteExpiresAt}
                      onChange={(e) => setAbsoluteExpiresAt(e.target.value)}
                    />
                  </Field>
                )}
                {validityMode === "relative" && (
                  <Field className="pt-2">
                    <FieldLabel htmlFor="batch-relative-amount">
                      Valid for
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="batch-relative-amount"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={relativeAmount}
                        onChange={(e) => setRelativeAmount(e.target.value)}
                        className="flex-1"
                      />
                      <Select
                        value={relativeUnit}
                        onValueChange={(value) =>
                          setRelativeUnit(value as ValidityUnit)
                        }
                      >
                        <SelectTrigger
                          id="batch-relative-unit"
                          aria-label="Duration unit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="years">Years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <FieldDescription>
                      Counted from first activation. Range: 1 day to 100 years.
                    </FieldDescription>
                  </Field>
                )}
              </div>
            </FieldSet>
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
