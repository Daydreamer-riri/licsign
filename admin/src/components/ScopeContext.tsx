import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Product } from "@/lib/types";

interface ScopeValue {
  /** The product the user is currently inside, or null at the top level. */
  product: Product | null;
  setProduct: (product: Product | null) => void;
}

const ScopeContext = createContext<ScopeValue | null>(null);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<Product | null>(null);
  return (
    <ScopeContext value={{ product, setProduct }}>{children}</ScopeContext>
  );
}

export function useScope(): ScopeValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used within ScopeProvider");
  return ctx;
}
