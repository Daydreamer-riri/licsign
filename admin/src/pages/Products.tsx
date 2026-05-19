import { useEffect, useState } from "react";
import { api } from "../api";

interface ProductRow {
  id: string;
  issuer_id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  default_max_devices: number;
  trial_enabled: number;
  trial_start_at: string | null;
  trial_end_at: string | null;
  trial_token_ttl_seconds: number | null;
  created_at: string;
  updated_at: string;
}

interface ProductFormData {
  code: string;
  name: string;
  description: string;
  default_max_devices: number;
  status?: "active" | "archived";
  trial_enabled: boolean;
  trial_start_at: string;
  trial_end_at: string;
  trial_token_ttl_seconds: string;
}

const emptyForm: ProductFormData = {
  code: "",
  name: "",
  description: "",
  default_max_devices: 1,
  trial_enabled: false,
  trial_start_at: "",
  trial_end_at: "",
  trial_token_ttl_seconds: "",
};

function formFromProduct(p: ProductRow): ProductFormData {
  return {
    code: p.code,
    name: p.name,
    description: p.description || "",
    default_max_devices: p.default_max_devices,
    status: p.status,
    trial_enabled: p.trial_enabled === 1,
    trial_start_at: p.trial_start_at || "",
    trial_end_at: p.trial_end_at || "",
    trial_token_ttl_seconds: p.trial_token_ttl_seconds?.toString() || "",
  };
}

const inputCls = "w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function ProductForm({
  form, setForm, onSubmit, onCancel, submitting, error, isEdit,
}: {
  form: ProductFormData;
  setForm: (f: ProductFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  error: string;
  isEdit: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">{isEdit ? "Edit Product" : "New Product"}</h3>
      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
          <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Devices</label>
          <input type="number" required min={1} value={form.default_max_devices} onChange={(e) => setForm({ ...form, default_max_devices: parseInt(e.target.value) || 1 })} className={inputCls} />
        </div>
        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "archived" })} className={inputCls}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.trial_enabled} onChange={(e) => setForm({ ...form, trial_enabled: e.target.checked })} />
          Trial enabled
        </label>
        {form.trial_enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trial Start</label>
              <input type="datetime-local" value={form.trial_start_at} onChange={(e) => setForm({ ...form, trial_start_at: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trial End</label>
              <input type="datetime-local" value={form.trial_end_at} onChange={(e) => setForm({ ...form, trial_end_at: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Trial TTL (seconds)</label>
              <input type="number" min={0} value={form.trial_token_ttl_seconds} onChange={(e) => setForm({ ...form, trial_token_ttl_seconds: e.target.value })} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onSubmit} disabled={submitting} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchProducts = async () => {
    const res = await api.get("/api/admin/products");
    if (res.ok) setProducts((await res.json()).products);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const buildBody = (f: ProductFormData, isEdit: boolean) => {
    const body: Record<string, unknown> = { code: f.code, name: f.name, default_max_devices: f.default_max_devices, trial_enabled: f.trial_enabled };
    if (f.description) body.description = f.description;
    if (isEdit && f.status) body.status = f.status;
    if (f.trial_enabled) {
      if (f.trial_start_at) body.trial_start_at = new Date(f.trial_start_at).toISOString();
      if (f.trial_end_at) body.trial_end_at = new Date(f.trial_end_at).toISOString();
      if (f.trial_token_ttl_seconds) body.trial_token_ttl_seconds = parseInt(f.trial_token_ttl_seconds);
    }
    return body;
  };

  const handleCreate = async () => {
    setSubmitting(true); setError("");
    const res = await api.post("/api/admin/products", buildBody(form, false));
    if (res.ok) { setShowCreate(false); setForm(emptyForm); await fetchProducts(); }
    else { const err = await res.json().catch(() => ({ message: "Failed" })); setError(err.message || "Failed to create product"); }
    setSubmitting(false);
  };

  const handleEdit = async () => {
    if (!editId) return;
    setSubmitting(true); setError("");
    const res = await api.patch("/api/admin/products/" + editId, buildBody(form, true));
    if (res.ok) { setEditId(null); setForm(emptyForm); await fetchProducts(); }
    else { const err = await res.json().catch(() => ({ message: "Failed" })); setError(err.message || "Failed to update product"); }
    setSubmitting(false);
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        {!showCreate && !editId && (
          <button onClick={() => { setShowCreate(true); setForm(emptyForm); setError(""); }} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">New Product</button>
        )}
      </div>
      {showCreate && <ProductForm form={form} setForm={setForm} onSubmit={handleCreate} onCancel={() => { setShowCreate(false); setError(""); }} submitting={submitting} error={error} isEdit={false} />}
      {editId && <ProductForm form={form} setForm={setForm} onSubmit={handleEdit} onCancel={() => { setEditId(null); setError(""); }} submitting={submitting} error={error} isEdit={true} />}
      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Max Devices</th>
              <th className="px-4 py-2 font-medium">Trial</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No products</td></tr>
            ) : products.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2"><span className={p.status === "active" ? "text-green-700" : "text-gray-500"}>{p.status}</span></td>
                <td className="px-4 py-2">{p.default_max_devices}</td>
                <td className="px-4 py-2">{p.trial_enabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <button onClick={() => { setEditId(p.id); setForm(formFromProduct(p)); setShowCreate(false); setError(""); }} className="text-blue-600 hover:text-blue-800 text-xs">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}