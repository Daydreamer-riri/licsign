import { useEffect, useState } from "react";
import { api } from "../api";

interface AdminRow {
  id: string;
  issuer_id: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const inputCls = "w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function AdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchAdmins = async () => {
    const res = await api.get("/api/admin/admins");
    if (res.ok) setAdmins((await res.json()).admins);
    setLoading(false);
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleCreate = async () => {
    setSubmitting(true); setError("");
    const res = await api.post("/api/admin/admins", { email, password });
    if (res.ok) {
      setShowCreate(false); setEmail(""); setPassword("");
      await fetchAdmins();
    } else {
      const err = await res.json().catch(() => ({ message: "Failed" }));
      setError(err.message || "Failed to create admin");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admins</h1>
        {!showCreate && (
          <button onClick={() => { setShowCreate(true); setError(""); }} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">New Admin</button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">New Admin</h3>
          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="Min 8 characters" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={submitting || password.length < 8} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">{submitting ? "Creating..." : "Create Admin"}</button>
            <button onClick={() => { setShowCreate(false); setError(""); }} className="px-4 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No admins</td></tr>
            ) : admins.map((a) => (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2">{a.email}</td>
                <td className="px-4 py-2"><span className={a.status === "active" ? "text-green-700" : "text-gray-500"}>{a.status}</span></td>
                <td className="px-4 py-2 text-gray-500">{new Date(a.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}