import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router";
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
  product_code: string;
  product_name: string;
  active_device_count: number;
}

interface ProductOption { id: string; code: string; name: string; }

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "text-green-700 bg-green-50",
    activated: "text-yellow-700 bg-yellow-50",
    disabled: "text-red-700 bg-red-50",
    revoked: "text-red-700 bg-red-50",
  };
  return <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + (colors[status] || "text-gray-700 bg-gray-50")}>{status}</span>;
}

const PAGE_SIZE = 50;
const inputCls = "px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function LicensesPage() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [count, setCount] = useState(0);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [productId, setProductId] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    api.get("/api/admin/products").then(async (res) => {
      if (res.ok) setProducts((await res.json()).products);
    });
  }, []);

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (productId) params.set("product_id", productId);
    if (status) params.set("status", status);
    params.set("take", PAGE_SIZE.toString());
    params.set("skip", skip.toString());
    const res = await api.get("/api/admin/licenses?" + params.toString());
    if (res.ok) { const data = await res.json(); setLicenses(data.licenses); setCount(data.count); }
    setLoading(false);
  }, [q, productId, status, skip]);

  useEffect(() => { fetchLicenses(); }, [fetchLicenses]);

  const handleSearch = () => { setSkip(0); };

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Licenses</h1>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="Activation code..." className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
          <select value={productId} onChange={(e) => { setProductId(e.target.value); setSkip(0); }} className={inputCls}>
            <option value="">All products</option>
            {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setSkip(0); }} className={inputCls}>
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="activated">Activated</option>
            <option value="disabled">Disabled</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <button onClick={handleSearch} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">Search</button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Activation Code</th>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Devices</th>
              <th className="px-4 py-2 font-medium">Expires</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : licenses.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No licenses found</td></tr>
            ) : licenses.map((l) => (
              <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2"><Link to={"/licenses/" + l.id} className="font-mono text-xs text-blue-600 hover:text-blue-800">{l.activation_code}</Link></td>
                <td className="px-4 py-2 font-mono text-xs">{l.product_code}</td>
                <td className="px-4 py-2"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-2">{l.active_device_count}/{l.max_devices}</td>
                <td className="px-4 py-2 text-gray-500">{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {currentPage} of {totalPages} ({count} total)</span>
          <div className="flex gap-2">
            <button onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))} disabled={skip === 0} className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Previous</button>
            <button onClick={() => setSkip(skip + PAGE_SIZE)} disabled={skip + PAGE_SIZE >= count} className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}