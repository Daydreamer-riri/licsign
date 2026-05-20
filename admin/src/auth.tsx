import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { api, setUnauthorizedHandler } from "./lib/api";

export interface AdminInfo {
  issuerId: string;
  issuerName: string;
  publicUserId: string;
  actor: { type: string; adminId?: string; email?: string; apiKeyId?: string };
}

interface AuthContextValue {
  admin: AdminInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ admin: AdminInfo }>("/api/admin/auth/me");
      setAdmin(data.admin);
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // An expired session mid-use clears auth, which bounces to /login.
    setUnauthorizedHandler(() => setAdmin(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post("/api/admin/auth/login", { email, password });
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/admin/auth/logout", {});
    } catch {
      // Even if the server call fails, drop the client session.
    }
    setAdmin(null);
  }, []);

  return (
    <AuthContext value={{ admin, loading, login, logout, refresh }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
