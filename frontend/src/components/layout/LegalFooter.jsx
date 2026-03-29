import LegalDocumentLink from "@/components/legal/LegalDocumentLink";

const LegalFooter = () => {
  return (
    <footer className="border-t border-border bg-card/80 px-6 py-4 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>Starxia ERP. SaaS de gestion empresarial.</p>
        <div className="flex flex-wrap gap-4">
          <LegalDocumentLink code="terms" label="Terminos" className="hover:text-foreground" />
          <LegalDocumentLink code="privacy" label="Privacidad" className="hover:text-foreground" />
          <LegalDocumentLink code="cookies" label="Cookies" className="hover:text-foreground" />
          <LegalDocumentLink code="dpa" label="Encargado del tratamiento" className="hover:text-foreground" />
          <a href="mailto:legal@starxia.com" className="hover:text-foreground">Contacto legal</a>
        </div>
      </div>
    </footer>
  );
};

export default LegalFooter;
