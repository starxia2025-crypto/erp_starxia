import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, User } from "lucide-react";

import { useAuth } from "@/App";
import { hasPermission } from "@/lib/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = ({ title, onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canOpenSettings = hasPermission(user, "settings.read");

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} data-testid="menu-toggle">
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative" data-testid="notifications-btn">
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm md:block">{user?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            {canOpenSettings && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
                  <User className="mr-2 h-4 w-4" />
                  Configuracion
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="menu-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
