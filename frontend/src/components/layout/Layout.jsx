import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useLocation } from "react-router-dom";

const Layout = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transform transition-transform duration-300 lg:transform-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar currentPath={location.pathname} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <Header title={title} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
