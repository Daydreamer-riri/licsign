import { Fragment } from "react";
import { Link, Outlet, useLocation } from "react-router";

import { useScope } from "@/components/ScopeContext";
import { CommandMenu } from "@/components/CommandMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface Crumb {
  label: string;
  to?: string;
}

function useCrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const { product } = useScope();
  const seg = pathname.split("/").filter(Boolean);

  if (seg[0] === "settings") {
    const crumbs: Crumb[] = [{ label: "Settings", to: "/settings" }];
    if (seg[1] === "admins") crumbs.push({ label: "Admins" });
    else if (seg[1] === "audit") crumbs.push({ label: "Audit Log" });
    return crumbs;
  }

  if (seg[0] === "products" && seg[1]) {
    const crumbs: Crumb[] = [{ label: "Products", to: "/" }];
    const productPath = `/products/${seg[1]}`;
    const name = product?.id === seg[1] ? product.name : "Product";
    const section = seg[2];

    if (!section) {
      crumbs.push({ label: name });
      return crumbs;
    }
    crumbs.push({ label: name, to: productPath });

    const sectionLabel =
      section === "batches"
        ? "Batches"
        : section === "licenses"
          ? "Licenses"
          : "Settings";
    if (seg[3]) {
      crumbs.push({ label: sectionLabel, to: `${productPath}/${section}` });
      crumbs.push({ label: section === "batches" ? "Batch" : "License" });
    } else {
      crumbs.push({ label: sectionLabel });
    }
    return crumbs;
  }

  return [{ label: "Products" }];
}

function AppBreadcrumb() {
  const crumbs = useCrumbs();

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem className="min-w-0">
                {last || !crumb.to ? (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to} className="truncate">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2.5 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="shrink-0 text-sm font-semibold tracking-tight"
            translate="no"
          >
            licsign
          </Link>
          <span className="shrink-0 text-border" aria-hidden="true">
            /
          </span>
          <AppBreadcrumb />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <CommandMenu />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
      >
        <Outlet />
      </main>
    </div>
  );
}
