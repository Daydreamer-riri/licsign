import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard" },
  { path: "/products", label: "Products" },
  { path: "/batches", label: "Batches" },
  { path: "/licenses", label: "Licenses" },
  { path: "/admins", label: "Admins" },
  { path: "/audit-logs", label: "Audit Log" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="font-semibold text-gray-900">licsign</span>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm ${
                    location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path))
                      ? "text-blue-600 font-medium"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {admin?.actor.type === "admin" ? admin.actor.email : "API Key"}
              </span>
              <button
                onClick={logout}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}