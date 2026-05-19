import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { api } from "../api";

interface LicenseRow {
  id: string;
  activation_code: string;
  product_id: string;
  batch_id: string;
  status: string;
  max_devices: number;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  product_code: string;
  product_name: string;
  active_device_count: number;
}

interface ActivationRow {
  id: string;
  license_id: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
  status: string;
  activated_at: string;
  deactivated_at: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "text-green-700 bg-green-50",
    activated: "text-yellow-700 bg-yellow-50",
    disabled: "text-red-700 bg-red-50",
    revoked: "text-red-700 bg-red-50",
    active: "text-green-700 bg-green-50",
    deactivated: "text-gray-700 bg-gray-50",
  };
  return <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + (colors[status] || "text-gray-700 bg-gray-50")}>{status}</span>;
}

export function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [license, setLicense] = useState<LicenseRow | null>(null);
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [showRevokeInput, setShowRevokeInput] = useState(false);

  const fetchLicense = async () => {
    if (!id) return;
    const res = await api.get("/api/admin/licenses/" + id);
    if (res.ok) {
      const data = await res.json();
      setLicense(data.license);
      setActivations(data.activations);
    } else {
      setError("Failed to load license");
    }
    setLoading(false);
  };

  useEffect(() => { fetchLicense(); }, [id]);

  const handleAction = async (action: "disable" | "enable") => {
    if (!id) return;
    setActionLoading(true); setError("");
    const res = await api.post("/api/admin/licenses/" + id + "/" + action, {});
    if (res.ok) { await fetchLicense(); }
    else { const err = await res.json().catch(() => ({ message: "Failed" })); setError(err.message || "Action failed"); }
    setActionLoading(false);
  };

  const handleRevoke = async () => {
    if (!id) return;
    setActionLoading(true); setError("");
    const body: Record<string, unknown> = {};
    if (revokeReason) body.reason = revokeReason;
    const res = await api.post("/api/admin/licenses/" + id + "/revoke", body);
    if (res.ok) { setShowRevokeInput(false); setRevokeReason(""); await fetchLicense(); }
    else { const err = await res.json().catch(() => ({ message: "Failed" })); setError(err.message || "Revoke failed"); }
    setActionLoading(false);
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (error && !license) return <div className="text-red-600">{error}</div>;
  if (!license) return <div className="text-gray-500">License not found</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/licenses" className="text-sm text-blue-600 hover:text-blue-800">&larr; Licenses</Link>
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold font-mono">{license.activation_code}</h1>
        <StatusBadge status={license.status} />
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        Disable/revoke does not immediately invalidate already-issued offline licenses.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><dt className="text-gray-500">Product</dt><dd className="font-mono text-xs">{license.product_code} &mdash; {license.product_name}</dd></div>
          <div><dt className="text-gray-500">Status</dt><dd><StatusBadge status={license.status} /></dd></div>
          <div><dt className="text-gray-500">Max Devices</dt><dd>{license.max_devices}</dd></div>
          <div><dt className="text-gray-500">Active Devices</dt><dd>{license.active_device_count}</dd></div>
          <div><dt className="text-gray-500">Expires</dt><dd>{license.expires_at ? new Date(license.expires_at).toLocaleDateString() : "\u2014"}</dd></div>
          <div><dt className="text-gray-500">Activated</dt><dd>{license.activated_at ? new Date(license.activated_at).toLocaleDateString() : "\u2014"}</dd></div>
          <div><dt className="text-gray-500">Created</dt><dd>{new Date(license.created_at).toLocaleDateString()}</dd></div>
          <div><dt className="text-gray-500">Updated</dt><dd>{new Date(license.updated_at).toLocaleDateString()}</dd></div>
          <div><dt className="text-gray-500">Batch</dt><dd><Link to={"/batches/" + license.batch_id} className="text-blue-600 hover:text-blue-800 text-xs">{license.batch_id}</Link></dd></div>
        </dl>
      </div>

      <div className="flex gap-2">
        {(license.status === "available" || license.status === "activated") && (
          <button onClick={() => handleAction("disable")} disabled={actionLoading} className="px-4 py-1.5 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700 disabled:opacity-50">Disable</button>
        )}
        {license.status === "disabled" && (
          <button onClick={() => handleAction("enable")} disabled={actionLoading} className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50">Enable</button>
        )}
        {license.status !== "revoked" && !showRevokeInput && (
          <button onClick={() => setShowRevokeInput(true)} className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700">Revoke</button>
        )}
      </div>

      {showRevokeInput && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
          <label className="block text-sm font-medium text-red-800">Revoke reason (optional)</label>
          <input type="text" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} className="w-full px-3 py-1.5 border border-red-300 rounded-md text-sm" placeholder="Reason..." />
          <div className="flex gap-2">
            <button onClick={handleRevoke} disabled={actionLoading} className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50">Confirm Revoke</button>
            <button onClick={() => { setShowRevokeInput(false); setRevokeReason(""); }} className="px-4 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <h2 className="text-sm font-medium text-gray-900">Activations ({activations.length})</h2>
      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Machine Hash</th>
              <th className="px-4 py-2 font-medium">Device Label</th>
              <th className="px-4 py-2 font-medium">Platform</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Activated</th>
              <th className="px-4 py-2 font-medium">Deactivated</th>
            </tr>
          </thead>
          <tbody>
            {activations.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No activations</td></tr>
            ) : activations.map((a) => (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{a.machine_hash}</td>
                <td className="px-4 py-2">{a.device_label || "\u2014"}</td>
                <td className="px-4 py-2">{a.platform || "\u2014"}</td>
                <td className="px-4 py-2"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-2 text-gray-500">{new Date(a.activated_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-gray-500">{a.deactivated_at ? new Date(a.deactivated_at).toLocaleDateString() : "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}