import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  FileText,
  ShoppingCart,
  BarChart3,
  Settings,
  Bot,
  ChevronDown,
  Moon,
  Sun,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { useAuth, useTheme } from "@/App";
import { canAccessAny, hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

const Sidebar = ({ currentPath }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [clientsOpen, setClientsOpen] = useState(currentPath.includes("/client"));
  const [suppliersOpen, setSuppliersOpen] = useState(currentPath.includes("/supplier"));
  const [inventoryOpen, setInventoryOpen] = useState(
    currentPath.includes("/product") || currentPath.includes("/warehouse") || currentPath.includes("/inventory")
  );
  const [salesOpen, setSalesOpen] = useState(currentPath.includes("/order") || currentPath.includes("/invoice"));
  const [purchasesOpen, setPurchasesOpen] = useState(currentPath.includes("/purchase"));

  const isActive = (path) => currentPath === path;
  const companyName = user?.company_name || "Business Hub";
  const companyLogoUrl = user?.company_logo_url || "";
  const companyInitials = companyName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "BH";

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={companyName}
                className="h-10 w-10 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
                <span className="text-sm font-bold text-primary-foreground">{companyInitials}</span>
              </div>
            )}
            <div className="min-w-0">
              <span className="block truncate font-semibold text-lg">{companyName}</span>
              <span className="block truncate text-xs text-muted-foreground">ERP Starxia</span>
            </div>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full border-border bg-card text-foreground shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {hasPermission(user, "dashboard.read") && (
          <Link to="/dashboard" className={`sidebar-link ${isActive("/dashboard") ? "active" : ""}`} data-testid="nav-dashboard">
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </Link>
        )}

        {hasPermission(user, "clients.read") && (
          <Collapsible open={clientsOpen} onOpenChange={setClientsOpen}>
            <CollapsibleTrigger className="sidebar-link w-full justify-between" data-testid="nav-clients-menu">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5" />
                <span>Clientes</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${clientsOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 space-y-1 mt-1">
              <Link to="/clients" className={`sidebar-link ${isActive("/clients") ? "active" : ""}`} data-testid="nav-clients">
                <span>Gestion de Clientes</span>
              </Link>
              <Link to="/client-types" className={`sidebar-link ${isActive("/client-types") ? "active" : ""}`} data-testid="nav-client-types">
                <span>Tipos de Cliente</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasPermission(user, "suppliers.read") && (
          <Collapsible open={suppliersOpen} onOpenChange={setSuppliersOpen}>
            <CollapsibleTrigger className="sidebar-link w-full justify-between" data-testid="nav-suppliers-menu">
              <div className="flex items-center gap-3">
                <Truck className="w-5 h-5" />
                <span>Proveedores</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${suppliersOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 space-y-1 mt-1">
              <Link to="/suppliers" className={`sidebar-link ${isActive("/suppliers") ? "active" : ""}`} data-testid="nav-suppliers">
                <span>Gestion de Proveedores</span>
              </Link>
              <Link to="/supplier-types" className={`sidebar-link ${isActive("/supplier-types") ? "active" : ""}`} data-testid="nav-supplier-types">
                <span>Tipos de Proveedor</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}

        {(hasPermission(user, "products.read") || hasPermission(user, "inventory.read")) && (
          <Collapsible open={inventoryOpen} onOpenChange={setInventoryOpen}>
            <CollapsibleTrigger className="sidebar-link w-full justify-between" data-testid="nav-inventory-menu">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5" />
                <span>Inventario</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${inventoryOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 space-y-1 mt-1">
              {hasPermission(user, "products.read") && (
                <>
                  <Link to="/products" className={`sidebar-link ${isActive("/products") ? "active" : ""}`} data-testid="nav-products">
                    <span>Productos</span>
                  </Link>
                  <Link to="/product-types" className={`sidebar-link ${isActive("/product-types") ? "active" : ""}`} data-testid="nav-product-types">
                    <span>Tipos de Producto</span>
                  </Link>
                </>
              )}
              {hasPermission(user, "inventory.read") && (
                <>
                  <Link to="/warehouses" className={`sidebar-link ${isActive("/warehouses") ? "active" : ""}`} data-testid="nav-warehouses">
                    <span>Almacenes</span>
                  </Link>
                  <Link to="/inventory" className={`sidebar-link ${isActive("/inventory") ? "active" : ""}`} data-testid="nav-inventory">
                    <span>Stock por Almacen</span>
                  </Link>
                  <Link to="/stock-transfers" className={`sidebar-link ${isActive("/stock-transfers") ? "active" : ""}`} data-testid="nav-stock-transfers">
                    <span>Transferencias</span>
                  </Link>
                </>
              )}
              {canAccessAny(user, ["sales.read", "purchases.read", "inventory.read"]) && (
                <Link to="/returns" className={`sidebar-link ${isActive("/returns") ? "active" : ""}`} data-testid="nav-returns">
                  <span>Devoluciones</span>
                </Link>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasPermission(user, "sales.read") && (
          <Collapsible open={salesOpen} onOpenChange={setSalesOpen}>
            <CollapsibleTrigger className="sidebar-link w-full justify-between" data-testid="nav-sales-menu">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5" />
                <span>Ventas</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${salesOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 space-y-1 mt-1">
              <Link to="/orders" className={`sidebar-link ${isActive("/orders") ? "active" : ""}`} data-testid="nav-orders">
                <span>Pedidos / Albaranes</span>
              </Link>
              <Link to="/invoices" className={`sidebar-link ${isActive("/invoices") ? "active" : ""}`} data-testid="nav-invoices">
                <span>Facturas</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasPermission(user, "purchases.read") && (
          <Collapsible open={purchasesOpen} onOpenChange={setPurchasesOpen}>
            <CollapsibleTrigger className="sidebar-link w-full justify-between" data-testid="nav-purchases-menu">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5" />
                <span>Compras</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${purchasesOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-8 space-y-1 mt-1">
              <Link to="/purchase-orders" className={`sidebar-link ${isActive("/purchase-orders") ? "active" : ""}`} data-testid="nav-purchase-orders">
                <span>Ordenes de Compra</span>
              </Link>
              <Link to="/purchase-invoices" className={`sidebar-link ${isActive("/purchase-invoices") ? "active" : ""}`} data-testid="nav-purchase-invoices">
                <span>Facturas de Compra</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasPermission(user, "reports.read") && (
          <>
            <Link to="/reports" className={`sidebar-link ${isActive("/reports") ? "active" : ""}`} data-testid="nav-reports">
              <FileText className="w-5 h-5" />
              <span>Informes</span>
            </Link>
            <Link to="/statistics" className={`sidebar-link ${isActive("/statistics") ? "active" : ""}`} data-testid="nav-statistics">
              <BarChart3 className="w-5 h-5" />
              <span>Estadisticas</span>
            </Link>
          </>
        )}

        {hasPermission(user, "ai.read") && (
          <Link to="/ai-assistant" className={`sidebar-link ${isActive("/ai-assistant") ? "active" : ""}`} data-testid="nav-ai-assistant">
            <Bot className="w-5 h-5" />
            <span>Asistente IA</span>
          </Link>
        )}

        {hasPermission(user, "settings.read") && (
          <Link to="/settings" className={`sidebar-link ${isActive("/settings") ? "active" : ""}`} data-testid="nav-settings">
            <Settings className="w-5 h-5" />
            <span>Configuracion</span>
          </Link>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
