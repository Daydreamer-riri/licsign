import { useEffect, useState, useCallback } from "react";
import { api } from "../api";

interface AuditLogEntry {
  id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details_json: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;
const inputCls = "px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [skip, setSkip] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    params.set("take", PAGE_SIZE.toString());
    params.set("skip", skip.toString());
    const res = await api.get("/api/admin/audit-logs?" + params.toString());
    if (res.ok) { const data = await res.json(); setLogs(data.audit_logs); setTotal(data.total); }
    setLoading(false);
  }, [action, skip]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  const formatDetails = (json: string | null) => {
    if (!json) return null;
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  };

  const truncate = (s: string | null, len: number) => {
    if (!s) return "\u2014";
    return s.length > len ? s.slice(0, len) + "\u2026" : s;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit Logs</h1>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
          <input type="text" value={action} onChange={(e) => { setAction(e.target.value); setSkip(0); }} placeholder="Filter by action..." className={inputCls} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No audit logs</td></tr>
            ) : logs.map((log) => (
              <>
                <tr key={log.id} className={"border-b border-gray-50 hover:bg-gray-50 cursor-pointer" + (expandedId === log.id ? " bg-gray-50" : "")} onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs">{log.actor_type}:{log.actor_id}</td>
                  <td className="px-4 py-2 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-2 text-xs">{log.target_type}:{log.target_id}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{truncate(log.details_json, 60)}</td>
                </tr>
                {expandedId === log.id && log.details_json && (
                  <tr key={log.id + "-detail"}>
                    <td colSpan={5} className="px-4 py-3 bg-gray-50">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all text-gray-700">{formatDetails(log.details_json)}</pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {currentPage} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))} disabled={skip === 0} className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Previous</button>
            <button onClick={() => setSkip(skip + PAGE_SIZE)} disabled={skip + PAGE_SIZE >= total} className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}