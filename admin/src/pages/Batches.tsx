import { useEffect, useState } from "react";
import { Link } from "react-router";
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

interface ProductOption {
  id: string;
  code: string;
  name: string;
}

interface CreateResult {
  activation_codes: string[];
  csv: string;
}

const inputCls = "w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function BatchesPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);

  const [productId, setProductId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [codePrefix, setCodePrefix] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [maxDevices, setMaxDevices] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const fetchData = async () => {
    const [bRes, pRes] = await Promise.all([
      api.get("/api/admin/batches"),
      api.get("/api/admin/products"),
    ]);
    if (bRes.ok) setBatches((await bRes.json()).batches);
    if (pRes.ok) {
      const prods = (await pRes.json()).products;
      setProducts(prods);
      if (prods.length > 0 && !productId) setProductId(prods[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setBatchName(""); setCodePrefix(""); setQuantity(10);
    setMaxDevices(""); setExpiresAt(""); setNotes("");
  };

  const handleCreate = async () => {
    setSubmitting(true); setError("");
    const body: Record<string, unknown> = { product_id: productId, batch_name: batchName, quantity };
    if (codePrefix) body.code_prefix = codePrefix;
    if (maxDevices) body.max_devices = parseInt(maxDevices);
    if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
    if (notes) body.notes = notes;

    const res = await api.post("/api/admin/batches", body);
    if (res.ok) {
      const data = await res.json();
      setResult({ activation_codes: data.activation_codes, csv: data.csv });
      resetForm(); setShowCreate(false);
      await fetchData();
    } else {
      const err = await res.json().catch(() => ({ message: "Failed" }));
      setError(err.message || "Failed to create batch");
    }
    setSubmitting(false);
  };

  const downloadCsv = () => {
    if (!result) return;
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "activation-codes.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Batches</h1>
        {!showCreate && (
          <button onClick={() => { setShowCreate(true); setResult(null); setError(""); }} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">New Batch</button>
        )}
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-green-800">{result.activation_codes.length} activation codes generated</h3>
            <div className="flex gap-2">
              <button onClick={downloadCsv} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">Download CSV</button>
              <button onClick={() => setResult(null)} className="px-3 py-1 border border-gray-300 text-xs rounded hover:bg-gray-50">Dismiss</button>
            </div>
          </div>
          <textarea
            readOnly
            value={result.activation_codes.join("\n")}
            rows={Math.min(result.activation_codes.length, 10)}
            className="w-full font-mono text-xs p-2 border border-green-300 rounded bg-white"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      )}

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">New Batch</h3>
          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} required className={inputCls}>
                {products.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.code})</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name</label>
              <input type="text" required value={batchName} onChange={(e) => setBatchName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code Prefix</label>
              <input type="text" value={codePrefix} onChange={(e) => setCodePrefix(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" required min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Devices</label>
              <input type="number" min={1} value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} placeholder="Default from product" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={submitting} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">{submitting ? "Creating..." : "Create Batch"}</button>
            <button onClick={() => { setShowCreate(false); setError(""); }} className="px-4 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Batch Name</th>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Quantity</th>
              <th className="px-4 py-2 font-medium">Max Devices</th>
              <th className="px-4 py-2 font-medium">Expires</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No batches</td></tr>
            ) : batches.map((b) => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2"><Link to={"/batches/" + b.id} className="text-blue-600 hover:text-blue-800">{b.batch_name}</Link></td>
                <td className="px-4 py-2 font-mono text-xs">{b.product_code}</td>
                <td className="px-4 py-2">{b.quantity}</td>
                <td className="px-4 py-2">{b.max_devices}</td>
                <td className="px-4 py-2 text-gray-500">{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(b.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}