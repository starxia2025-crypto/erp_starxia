import { useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/App";
import Header from "./Header";
import LegalFooter from "./LegalFooter";
import Sidebar from "./Sidebar";

const Layout = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const pendingLegalDocuments = user?.pending_legal_documents || [];

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 lg:static lg:z-auto lg:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar currentPath={location.pathname} />
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <Header title={title} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        {pendingLegalDocuments.length > 0 && (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-3 text-sm text-amber-200">
            Tienes documentos legales pendientes de reaceptacion. Revisalos en Configuracion &gt; Legal.
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">{children}</main>
        <LegalFooter />
      </div>
    </div>
  );
};

export default Layout;
