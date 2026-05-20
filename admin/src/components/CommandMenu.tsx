import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  KeyRoundIcon,
  LayoutGridIcon,
  PackageIcon,
  ScrollTextIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";

import { api } from "@/lib/api";
import type { License, ProductWithCount } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const NAV = [
  { label: "Products", to: "/", icon: LayoutGridIcon },
  { label: "Admins", to: "/settings/admins", icon: UsersIcon },
  { label: "Audit Log", to: "/settings/audit", icon: ScrollTextIcon },
];

/** Global ⌘K palette: jump to a product, license, or page. */
export function CommandMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductWithCount[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Products load once per open; the set is small enough to filter client-side.
  useEffect(() => {
    if (!open) return;
    api
      .get<{ products: ProductWithCount[] }>("/api/admin/products")
      .then((d) => setProducts(d.products))
      .catch(() => setProducts([]));
  }, [open]);

  // Licenses are searched server-side (by activation code or recipient).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLicenses([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get<{ licenses: License[] }>(
          `/api/admin/licenses?q=${encodeURIComponent(q)}&take=6`,
        )
        .then((d) => setLicenses(d.licenses))
        .catch(() => setLicenses([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const q = query.trim().toLowerCase();
  const visibleProducts = (
    q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q),
        )
      : products
  ).slice(0, 6);
  const visibleNav = q
    ? NAV.filter((n) => n.label.toLowerCase().includes(q))
    : NAV;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Search products and licenses"
        className="gap-2 font-normal text-muted-foreground sm:w-60 sm:justify-start"
      >
        <SearchIcon data-icon="inline-start" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[0.7rem] sm:inline-block">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Jump to a product, license, or page."
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search products, licenses…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {searching ? "Searching…" : "No results found."}
            </CommandEmpty>

            {visibleProducts.length > 0 && (
              <CommandGroup heading="Products">
                {visibleProducts.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`product:${p.id}`}
                    onSelect={() => go(`/products/${p.id}`)}
                  >
                    <PackageIcon />
                    <span className="truncate">{p.name}</span>
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      translate="no"
                    >
                      {p.code}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {licenses.length > 0 && (
              <CommandGroup heading="Licenses">
                {licenses.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`license:${l.id}`}
                    onSelect={() =>
                      go(`/products/${l.product_id}/licenses/${l.id}`)
                    }
                  >
                    <KeyRoundIcon />
                    <span className="truncate font-mono" translate="no">
                      {l.activation_code}
                    </span>
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      translate="no"
                    >
                      {l.product_code}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {visibleNav.length > 0 && (
              <CommandGroup heading="Go to">
                {visibleNav.map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`nav:${item.to}`}
                    onSelect={() => go(item.to)}
                  >
                    <item.icon />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
