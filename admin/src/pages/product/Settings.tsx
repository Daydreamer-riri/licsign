import { useState } from "react";
import type { FormEvent } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useProduct } from "./ProductLayout";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProductSettingsPage() {
  const { product } = useProduct();
  const revalidator = useRevalidator();

  const [code, setCode] = useState(product.code);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [maxDevices, setMaxDevices] = useState(
    String(product.default_max_devices),
  );
  const [trialEnabled, setTrialEnabled] = useState(product.trial_enabled === 1);
  const [trialStart, setTrialStart] = useState(
    toLocalInput(product.trial_start_at),
  );
  const [trialEnd, setTrialEnd] = useState(toLocalInput(product.trial_end_at));
  const [trialTtl, setTrialTtl] = useState(
    product.trial_token_ttl_seconds
      ? String(product.trial_token_ttl_seconds)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivePending, setArchivePending] = useState(false);

  const archived = product.status === "archived";

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        default_max_devices: Number(maxDevices) || 1,
        trial_enabled: trialEnabled,
      };
      if (trialEnabled) {
        body.trial_start_at = trialStart
          ? new Date(trialStart).toISOString()
          : null;
        body.trial_end_at = trialEnd ? new Date(trialEnd).toISOString() : null;
        body.trial_token_ttl_seconds = trialTtl ? Number(trialTtl) : null;
      }
      await api.patch(`/api/admin/products/${product.id}`, body);
      toast.success("Product updated");
      revalidator.revalidate();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    try {
      await api.patch(`/api/admin/products/${product.id}`, {
        status: archived ? "active" : "archived",
      });
      toast.success(archived ? "Product restored" : "Product archived");
      setArchivePending(false);
      revalidator.revalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
      throw err;
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>Product settings</CardTitle>
            <CardDescription>
              Update product details and trial configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive" aria-live="polite">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-code">Code</FieldLabel>
                <Input
                  id="settings-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-name">Name</FieldLabel>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="settings-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-max-devices">
                  Default device limit
                </FieldLabel>
                <Input
                  id="settings-max-devices"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={maxDevices}
                  onChange={(e) => setMaxDevices(e.target.value)}
                  required
                  className="max-w-32"
                />
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="settings-trial">Trial</FieldLabel>
                  <FieldDescription>
                    Allow time-limited trial tokens for this product.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="settings-trial"
                  checked={trialEnabled}
                  onCheckedChange={setTrialEnabled}
                />
              </Field>
              {trialEnabled && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="trial-start">Trial start</FieldLabel>
                    <Input
                      id="trial-start"
                      type="datetime-local"
                      value={trialStart}
                      onChange={(e) => setTrialStart(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="trial-end">Trial end</FieldLabel>
                    <Input
                      id="trial-end"
                      type="datetime-local"
                      value={trialEnd}
                      onChange={(e) => setTrialEnd(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="trial-ttl">Token TTL (s)</FieldLabel>
                    <Input
                      id="trial-ttl"
                      type="number"
                      inputMode="numeric"
                      value={trialTtl}
                      onChange={(e) => setTrialTtl(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {archived ? "Restore product" : "Archive product"}
          </CardTitle>
          <CardDescription>
            {archived
              ? "Restore this product so new batches can be created again."
              : "Archived products keep their licenses but cannot receive new batches."}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button
            variant={archived ? "outline" : "destructive"}
            onClick={() => setArchivePending(true)}
          >
            {archived ? "Restore Product" : "Archive Product"}
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={archivePending}
        onOpenChange={setArchivePending}
        title={archived ? "Restore this product?" : "Archive this product?"}
        description={
          archived
            ? "New batches can be created for this product again."
            : "You will not be able to create new batches until the product is restored. Existing licenses are unaffected."
        }
        confirmLabel={archived ? "Restore Product" : "Archive Product"}
        destructive={!archived}
        onConfirm={toggleArchive}
      />
    </div>
  );
}
