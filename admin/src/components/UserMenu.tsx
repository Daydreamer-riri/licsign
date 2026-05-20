import { useNavigate } from "react-router";
import { LogOutIcon } from "lucide-react";

import { api } from "@/lib/api";
import type { AdminInfo } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ admin }: { admin: AdminInfo }) {
  const navigate = useNavigate();

  const email = admin.actor.type === "admin" ? admin.actor.email : undefined;
  const display = email ?? "API Key";
  const initials = (email ? email.slice(0, 2) : "AK").toUpperCase();

  const handleLogout = async () => {
    try {
      await api.post("/api/admin/auth/logout", {});
    } catch {
      // Even if the server call fails, drop the client session.
    }
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span
            className="truncate text-sm font-medium text-foreground"
            translate="no"
          >
            {display}
          </span>
          {admin.issuerName && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {admin.issuerName}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
            <LogOutIcon />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
