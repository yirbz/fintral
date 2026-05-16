import Link from "next/link";

import { Logo } from "@/components/ui/logo";

const footerSections = [
  {
    title: "Producto",
    links: [
      { label: "Extracción IA", href: "#" },
      { label: "Validación NCF", href: "#" },
      { label: "WhatsApp Bot", href: "#" },
      { label: "Precios", href: "#" },
    ],
  },
  {
    title: "Desarrolladores",
    links: [
      { label: "Documentación", href: "#" },
      { label: "Referencia API", href: "#" },
      { label: "Estado del sistema", href: "#" },
    ],
  },
  {
    title: "Compañía",
    links: [
      { label: "Acerca de", href: "#" },
      { label: "Contacto", href: "#" },
      { label: "Privacidad", href: "#" },
      { label: "Términos", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-[#e3e8ee] bg-white pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          <div className="col-span-2 md:col-span-1">
            <Logo variant="dark" size="sm" />
            <p className="mt-4 text-[13px] text-[#64748d] leading-relaxed [font-feature-settings:'tnum'] max-w-xs">
              Infraestructura financiera automatizada para la República
              Dominicana.
            </p>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <h4 className="font-medium text-[#0d253d] text-[13px] mb-4">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-[#64748d] hover:text-[#533afd] transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-[#e3e8ee] gap-4 md:gap-0">
          <p className="text-[13px] text-[#61718a] [font-feature-settings:'tnum']">
            &copy; {new Date().getFullYear()} Fintral. Todos los derechos
            reservados.
          </p>
          <span className="flex items-center gap-1.5 text-[13px] text-[#61718a]">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Sistemas operativos
          </span>
        </div>
      </div>
    </footer>
  );
}
