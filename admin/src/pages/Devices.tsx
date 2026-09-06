import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { MonitorIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface ManagedDevice {
  id: string;
  device_label: string | null;
  platform: string | null;
  activated_at: string;
  last_seen_at: string | null;
  machine_hash_suffix: string;
}

interface DeviceManagementResponse {
  product: { code: string; name: string };
  license: {
    status: "available" | "activated" | "disabled" | "revoked";
    max_devices: number;
    active_devices: number;
    can_reactivate: boolean;
  };
  devices: ManagedDevice[];
}

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "暂无记录" : dateTime.format(date);
}

function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "请求失败，请稍后重试。";
  if (error.code === "INVALID_CODE") return "找不到这个激活码，请检查后重试。";
  if (error.code === "DEVICE_NOT_FOUND") return "该设备已被停用或不属于这个激活码。";
  if (error.status === 0) return "无法连接服务器，请检查网络后重试。";
  return "请求失败，请稍后重试。";
}

export function meta() {
  return [
    { title: "设备管理 | licsign" },
    { name: "description", content: "查看并停用激活码下正在占用名额的设备。" },
  ];
}

export default function DevicesPage() {
  const [activationCode, setActivationCode] = useState("");
  const [data, setData] = useState<DeviceManagementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<ManagedDevice | null>(null);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = "zh-CN";
    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, []);

  const loadDevices = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setData(
        await api.post<DeviceManagementResponse>("/api/client/devices", {
          activation_code: activationCode.trim(),
        }),
      );
    } catch (err) {
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const deactivateDevice = async () => {
    if (!selectedDevice) return;
    try {
      await api.post(`/api/client/devices/${encodeURIComponent(selectedDevice.id)}/deactivate`, {
        activation_code: activationCode.trim(),
      });
      setSelectedDevice(null);
      toast.success("设备已停用，名额已释放");
      await loadDevices();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheckIcon aria-hidden="true" />
            <span translate="no">licsign</span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">管理已激活设备</h1>
            <p className="max-w-2xl text-sm/relaxed text-muted-foreground sm:text-base/relaxed">
              输入激活码，查看当前占用名额的设备，并释放不再使用的设备名额。
            </p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>查找设备</CardTitle>
            <CardDescription>激活码仅用于本次查询，不会保存在浏览器中。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loadDevices} noValidate>
              <FieldGroup>
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="activation-code">激活码</FieldLabel>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      id="activation-code"
                      name="activation_code"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      required
                      aria-invalid={Boolean(error)}
                      value={activationCode}
                      onChange={(event) => setActivationCode(event.target.value)}
                      placeholder="TV-XXXX-XXXX-XXXX-XXXX"
                      className="font-mono"
                    />
                    <Button type="submit" disabled={loading || activationCode.trim().length === 0}>
                      {loading && <Spinner data-icon="inline-start" />}
                      {loading ? "正在查询…" : "查看设备"}
                    </Button>
                  </div>
                  <FieldDescription>不要在公共或不受信任的设备上使用此页面。</FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" aria-live="polite">
            <AlertTitle>无法查看设备</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data && (
          <section className="flex flex-col gap-4" aria-labelledby="device-list-title">
            {!data.license.can_reactivate && (
              <Alert>
                <AlertTitle>这个激活码当前无法重新激活设备</AlertTitle>
                <AlertDescription>
                  你仍可停用设备并释放名额，但停用后该设备可能无法再次激活。
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{data.product.name}</p>
                <h2 id="device-list-title" className="text-xl font-semibold tracking-tight">
                  已激活设备
                </h2>
              </div>
              <div className="text-right" aria-label={`已使用 ${data.license.active_devices} 个，共 ${data.license.max_devices} 个设备名额`}>
                <strong className="text-3xl font-semibold tabular-nums">
                  {data.license.active_devices}
                  <span className="text-base font-normal text-muted-foreground">
                    /{data.license.max_devices}
                  </span>
                </strong>
                <p className="text-xs text-muted-foreground">已用名额</p>
              </div>
            </div>

            {data.devices.length === 0 ? (
              <Card>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><MonitorIcon aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>没有占用名额的设备</EmptyTitle>
                    <EmptyDescription>使用此激活码激活新设备后，它会显示在这里。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </Card>
            ) : (
              <div className="grid gap-3">
                {data.devices.map((device) => (
                  <Card key={device.id} size="sm">
                    <CardHeader>
                      <CardTitle>{device.device_label || "未命名设备"}</CardTitle>
                      <CardDescription>
                        {device.platform || "未知平台"} · 设备尾号 {device.machine_hash_suffix}
                      </CardDescription>
                      <CardAction>
                        <Button variant="outline" size="sm" onClick={() => setSelectedDevice(device)}>
                          停用设备
                        </Button>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>激活于 {formatDateTime(device.activated_at)}</span>
                      <span>最近在线 {formatDateTime(device.last_seen_at)}</span>
                      <Badge variant="secondary">正在占用名额</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(selectedDevice)}
        onOpenChange={(open) => !open && setSelectedDevice(null)}
        title="停用这台设备？"
        description={
          data?.license.can_reactivate === false
            ? "停用只会释放设备名额，不会立即让该设备上的离线许可证失效。这个激活码当前无法重新激活设备，停用后可能无法恢复该设备的名额。"
            : "停用只会释放设备名额，不会立即让该设备上的离线许可证失效。只要激活码仍然有效且有空余名额，该设备以后可以重新激活。"
        }
        confirmLabel="停用设备"
        cancelLabel="取消"
        destructive
        onConfirm={deactivateDevice}
      />
    </main>
  );
}
