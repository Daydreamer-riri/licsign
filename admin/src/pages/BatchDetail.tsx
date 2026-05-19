import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { api } from "../api";

interface BatchRow {
  id: string;
  product_id: string;
  batch_name: string;
  code_prefix: string;
  quantity: number;
  max_devices: number;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  product_code: string;
  product_name: string;
}

interface LicenseSummary {
  id: string;
  activation_code: string;
  status: string;
  max_devices: number;
  expires_at: string | null;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "text-green-700 bg-green-50",
    activated: "text-yellow-700 bg-yellow-50",
    disabled: "text-red-700 bg-red-50",
    revoked: "text-red-700 bg-red-50",
  };
  return (
    <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + (colors[status] || "text-gray-700 bg-gray-50")}>
      {status}
    </span>
  );
}

export function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [licenses, setLicenses] = useState<LicenseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get("/api/admin/batches/" + id).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setBatch(data.batch);
        setLicenses(data.licenses);
      } else {
        setError("Failed to load batch");
      }
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!batch) return <div className="text-gray-500">Batch not found</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/batches" className="text-sm text-blue-600 hover:text-blue-800">&larr; Batches</Link>
      </div>
      <h1 className="text-xl font-semibold">{batch.batch_name}</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><dt className="text-gray-500">Product</dt><dd className="font-mono text-xs">{batch.product_code} &mdash; {batch.product_name}</dd></div>
          <div><dt className="text-gray-500">Quantity</dt><dd>{batch.quantity}</dd></div>
          <div><dt className="text-gray-500">Max Devices</dt><dd>{batch.max_devices}</dd></div>
          <div><dt className="text-gray-500">Prefix</dt><dd className="font-mono text-xs">{batch.code_prefix || "\u2014"}</dd></div>
          <div><dt className="text-gray-500">Expires</dt><dd>{batch.expires_at ? new Date(batch.expires_at).toLocaleDateString() : "\u2014"}</dd></div>
          <div><dt className="text-gray-500">Created</dt><dd>{new Date(batch.created_at).toLocaleDateString()}</dd></div>
          {batch.notes && (<div className="col-span-2 sm:col-span-3"><dt className="text-gray-500">Notes</dt><dd>{batch.notes}</dd></div>)}
        </dl>
      </div>

      <h2 className="text-sm font-medium text-gray-900">Licenses ({licenses.length})</h2>
      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Activation Code</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Max Devices</th>
              <th className="px-4 py-2 font-medium">Expires</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {licenses.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No licenses</td></tr>
            ) : licenses.map((l) => (
              <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2"><Link to={"/licenses/" + l.id} className="font-mono text-xs text-blue-600 hover:text-blue-800">{l.activation_code}</Link></td>
                <td className="px-4 py-2"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-2">{l.max_devices}</td>
                <td className="px-4 py-2 text-gray-500">{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}