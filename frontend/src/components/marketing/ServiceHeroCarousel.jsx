import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const createServiceArt = (title, orientation, startColor, endColor, accentColor) => {
  const width = orientation === "poster" ? 600 : 1200;
  const height = 900;
  const titleSize = orientation === "poster" ? 56 : 64;
  const subtitle = orientation === "poster" ? "Solucion digital" : "Experiencia premium";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="15%" r="70%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.42)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" rx="34" fill="url(#bg)" />
      <rect x="${orientation === "poster" ? 36 : 60}" y="${orientation === "poster" ? 48 : 60}" width="${orientation === "poster" ? width - 72 : width - 120}" height="${orientation === "poster" ? 220 : 180}" rx="30" fill="url(#glow)" opacity="0.9" />
      <circle cx="${orientation === "poster" ? width - 120 : width - 150}" cy="${orientation === "poster" ? 176 : 140}" r="${orientation === "poster" ? 112 : 120}" fill="${accentColor}" opacity="0.28" />
      <rect x="${orientation === "poster" ? 54 : 90}" y="${orientation === "poster" ? 520 : 590}" width="${orientation === "poster" ? width - 108 : width * 0.42}" height="2" fill="rgba(255,255,255,0.24)" />
      <text x="${orientation === "poster" ? 56 : 90}" y="${orientation === "poster" ? 630 : 510}" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="${titleSize}" font-weight="700">${title}</text>
      <text x="${orientation === "poster" ? 56 : 90}" y="${orientation === "poster" ? 708 : 568}" fill="rgba(255,255,255,0.74)" font-family="Inter,Arial,sans-serif" font-size="28">${subtitle}</text>
      <rect x="${orientation === "poster" ? 56 : 90}" y="${orientation === "poster" ? 760 : 644}" width="${orientation === "poster" ? 188 : 212}" height="60" rx="30" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.12)" />
      <text x="${orientation === "poster" ? 92 : 126}" y="${orientation === "poster" ? 798 : 683}" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="600">Starxia</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const SERVICE_ITEMS = [
  {
    id: "classic-web",
    title: "Pagina web clasica",
    description:
      "La solucion ideal para presentar tu negocio con una web clara, rapida y bien estructurada.",
    badges: ["Lanzamiento rapido", "Base esencial"],
    tags: ["Web corporativa", "Rapida", "Facil de mantener"],
    palette: ["#2e354c", "#111827", "#ff7a1a"],
    demoUrl: "#demo-web-clasica",
  },
  {
    id: "professional-web",
    title: "Sitio web profesional",
    description:
      "Una presencia digital mas solida, pensada para captar clientes y reforzar tu marca.",
    badges: ["Imagen premium", "Crecimiento digital"],
    tags: ["Imagen premium", "Conversion", "SEO preparado"],
    palette: ["#10344c", "#08131d", "#4dd2ff"],
    demoUrl: "#demo-sitio-profesional",
  },
  {
    id: "erp-verifactu",
    title: "ERP administrativo Verifactu",
    description:
      "Gestiona facturacion, procesos administrativos y adaptacion a Verifactu en una sola plataforma.",
    badges: ["Cumplimiento fiscal", "SaaS listo"],
    tags: ["Verifactu", "Facturacion", "Control administrativo"],
    palette: ["#4b1f1f", "#18090d", "#ff9055"],
    demoUrl: "#demo-verifactu",
  },
  {
    id: "erp-vet",
    title: "ERP Vet",
    description:
      "Software especializado para clinicas veterinarias, con gestion agil y vision completa del negocio.",
    badges: ["Sectorial", "Operacion central"],
    tags: ["Veterinarias", "Agenda y gestion", "Operativa centralizada"],
    palette: ["#143b37", "#071615", "#53d49d"],
    demoUrl: "#demo-vet",
  },
  {
    id: "erp-dental",
    title: "ERP dental",
    description:
      "Optimiza la gestion de tu clinica dental con una solucion disenada para el dia a dia real.",
    badges: ["Clinica premium", "Flujo continuo"],
    tags: ["Clinicas dentales", "Gestion integral", "Productividad"],
    palette: ["#3b2453", "#12071b", "#d98cff"],
    demoUrl: "#demo-dental",
  },
].map((item) => ({
  ...item,
  posterImage: createServiceArt(item.title, "poster", item.palette[0], item.palette[1], item.palette[2]),
  expandedImage: createServiceArt(item.title, "expanded", item.palette[0], item.palette[1], item.palette[2]),
}));

const CLONE_COUNT = 4;
const SWIPE_THRESHOLD = 46;

const ServiceHeroCarousel = () => {
  const items = useMemo(
    () => [
      ...SERVICE_ITEMS.slice(-CLONE_COUNT),
      ...SERVICE_ITEMS,
      ...SERVICE_ITEMS.slice(0, CLONE_COUNT),
    ],
    []
  );
  const [index, setIndex] = useState(CLONE_COUNT);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [activeServiceId, setActiveServiceId] = useState(SERVICE_ITEMS[1].id);
  const [isDesktop, setIsDesktop] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartX = useRef(0);
  const carouselRef = useRef(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncDesktop = () => setIsDesktop(mediaQuery.matches);
    const syncMotion = () => setPrefersReducedMotion(reducedMotionQuery.matches);
    syncDesktop();
    syncMotion();
    mediaQuery.addEventListener("change", syncDesktop);
    reducedMotionQuery.addEventListener("change", syncMotion);
    return () => {
      mediaQuery.removeEventListener("change", syncDesktop);
      reducedMotionQuery.removeEventListener("change", syncMotion);
    };
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      setActiveServiceId(null);
    }
  }, [isDesktop]);

  const goNext = () => {
    setTransitionEnabled(!prefersReducedMotion);
    setIndex((current) => current + 1);
  };

  const goPrev = () => {
    setTransitionEnabled(!prefersReducedMotion);
    setIndex((current) => current - 1);
  };

  const handleTransitionEnd = () => {
    if (index >= SERVICE_ITEMS.length + CLONE_COUNT) {
      setTransitionEnabled(false);
      setIndex(CLONE_COUNT);
      return;
    }
    if (index < CLONE_COUNT) {
      setTransitionEnabled(false);
      setIndex(SERVICE_ITEMS.length + CLONE_COUNT - 1);
    }
  };

  useEffect(() => {
    if (transitionEnabled) return;
    const frame = requestAnimationFrame(() => setTransitionEnabled(true));
    return () => cancelAnimationFrame(frame);
  }, [transitionEnabled]);

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
    }
  };

  const handleBuy = (service) => {
    toast.success(`${service.title} listo para conectar con tu carrito`);
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX || 0;
  };

  const handleTouchEnd = (event) => {
    const endX = event.changedTouches[0]?.clientX || 0;
    const delta = endX - touchStartX.current;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) goNext();
    if (delta > 0) goPrev();
  };

  return (
    <section className="service-hero-carousel">
      <div className="service-hero-carousel__intro">
        <div className="service-hero-carousel__eyebrow">
          <Sparkles className="h-4 w-4" />
          Soluciones digitales listas para vender
        </div>
        <div className="service-hero-carousel__headline">
          <div>
            <h2>Elige la experiencia Starxia que mejor encaja con tu negocio.</h2>
            <p>
              Un carrusel premium pensado para presentar servicios digitales y software con una narrativa clara,
              visual y comercial.
            </p>
          </div>
          <div className="service-hero-carousel__meta">
            <span>
              <MonitorSmartphone className="h-4 w-4" />
              Desktop, tablet y movil
            </span>
            <span>
              <ShieldCheck className="h-4 w-4" />
              Demo 7 dias sin tarjeta
            </span>
          </div>
        </div>
      </div>

      <div
        className="service-hero-carousel__viewport"
        ref={carouselRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-label="Carrusel de servicios"
      >
        <button
          type="button"
          className="service-hero-carousel__nav service-hero-carousel__nav--left"
          onClick={goPrev}
          aria-label="Servicio anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="service-hero-carousel__mask">
          <div
            className="service-hero-carousel__track"
            style={{
              transform: `translateX(calc(-${index} * (var(--service-card-width) + var(--service-card-gap))))`,
              transition: transitionEnabled ? "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            {items.map((service, itemIndex) => {
              const isActive = isDesktop && activeServiceId === service.id;
              const alignClass =
                (itemIndex - index + SERVICE_ITEMS.length * 4) % 4 === 3
                  ? "service-card--align-right"
                  : (itemIndex - index + SERVICE_ITEMS.length * 4) % 4 === 0
                    ? "service-card--align-left"
                    : "service-card--align-center";

              return (
                <article
                  key={`${service.id}-${itemIndex}`}
                  className={`service-card ${isActive ? "service-card--active" : ""} ${alignClass}`}
                  onMouseEnter={() => isDesktop && setActiveServiceId(service.id)}
                  onFocus={() => isDesktop && setActiveServiceId(service.id)}
                  onTouchStart={() => !isDesktop && setActiveServiceId(service.id)}
                >
                  <button
                    type="button"
                    className="service-card__compact"
                    onMouseEnter={() => isDesktop && setActiveServiceId(service.id)}
                    aria-label={`Abrir detalles de ${service.title}`}
                  >
                    <img src={service.posterImage} alt={service.title} className="service-card__poster" />
                    <div className="service-card__compact-overlay" />
                    <div className="service-card__compact-content">
                      <div className="service-card__badges">
                        {service.badges.map((badge) => (
                          <span key={badge}>{badge}</span>
                        ))}
                      </div>
                      <h3>{service.title}</h3>
                    </div>
                  </button>

                  <div className={`service-card__expanded ${isActive ? "is-visible" : ""}`}>
                    <img src={service.expandedImage} alt={service.title} className="service-card__expanded-image" />
                    <div className="service-card__expanded-overlay" />
                    <div className="service-card__expanded-content">
                      <div className="service-card__expanded-topline">
                        {service.badges.map((badge) => (
                          <span key={badge}>{badge}</span>
                        ))}
                      </div>
                      <h3>{service.title}</h3>
                      <p>{service.description}</p>
                      <div className="service-card__tags">
                        {service.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      <div className="service-card__actions">
                        <div className="service-card__primary-action">
                          <Button asChild size="lg">
                            <a href={service.demoUrl}>Comenzar demo 7 dias</a>
                          </Button>
                          <span className="service-card__no-card-tag">No se requiere tarjeta</span>
                        </div>
                        <Button
                          type="button"
                          size="lg"
                          variant="secondary"
                          className="service-card__buy-button"
                          onClick={() => handleBuy(service)}
                        >
                          Comprar
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="service-hero-carousel__nav service-hero-carousel__nav--right"
          onClick={goNext}
          aria-label="Servicio siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
};

export default ServiceHeroCarousel;
