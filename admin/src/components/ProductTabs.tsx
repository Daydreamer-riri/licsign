import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview", segment: "" },
  { label: "Batches", segment: "batches" },
  { label: "Licenses", segment: "licenses" },
  { label: "Settings", segment: "settings" },
];

/** Underline tab nav for the product scope (Overview / Batches / …). */
export function ProductTabs({ productId }: { productId: string }) {
  const { pathname } = useLocation();
  const base = `/products/${productId}`;

  return (
    <nav
      aria-label="Product sections"
      className="-mb-px flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map((tab) => {
        const to = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment
          ? pathname.startsWith(`${base}/${tab.segment}`)
          : pathname === base;
        return (
          <Link
            key={tab.label}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 pt-1 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
