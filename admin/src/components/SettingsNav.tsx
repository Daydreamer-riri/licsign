import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Admins", to: "/settings/admins" },
  { label: "Audit Log", to: "/settings/audit" },
];

/** Underline tab nav for the settings scope. */
export function SettingsNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Settings sections"
      className="-mb-px flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
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
