import { useEffect, useState } from "react";
import { api } from "../api";

interface DashboardData {
  product_count: number;
  license_count: number;
  recent_activations: Array<{
    activation_id: string;
    license_id: string;
    activation_code: string;
    product_code: string;
    machine_hash: string;
    device_label: string | null;
    platform: string | null;
    activated_at: string;
  }>;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/admin/dashboard/stats?limit=10").then(async (res) => {
      if (res.ok) setData(await res.json());
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!data) return <div className="text-red-600">Failed to load dashboard</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Products</div>
          <div className="text-2xl font-semibold">{data.product_count}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Licenses</div>
          <div className="text-2xl font-semibold">{data.license_count}</div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-medium text-gray-900">Recent Activations</h2>
        </div>
        {data.recent_activations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No activations yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">Activation Code</th>
                <th className="px-4 py-2 font-medium">Device</th>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Activated</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_activations.map((a) => (
                <tr key={a.activation_id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{a.product_code}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.activation_code}</td>
                  <td className="px-4 py-2">{a.device_label || "—"}</td>
                  <td className="px-4 py-2">{a.platform || "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{new Date(a.activated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}