import { Link } from "react-router-dom";

const LegalFooter = () => {
  return (
    <footer className="border-t border-border bg-card/80 px-6 py-4 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>Starxia ERP. SaaS de gestion empresarial.</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/legal/terms" className="hover:text-foreground">Terminos</Link>
          <Link to="/legal/privacy" className="hover:text-foreground">Privacidad</Link>
          <Link to="/legal/cookies" className="hover:text-foreground">Cookies</Link>
          <Link to="/legal/dpa" className="hover:text-foreground">Encargado del tratamiento</Link>
          <a href="mailto:legal@starxia.com" className="hover:text-foreground">Contacto legal</a>
        </div>
      </div>
    </footer>
  );
};

export default LegalFooter;
