import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CONTACT_EMAIL, STUDIO, STUDIO_DOMAIN } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Qué datos guarda Herramientas, para qué los usa y cómo pedir que se borren.",
};

const UPDATED = "9 de octubre de 2026";

const contact = CONTACT_EMAIL ? (
  <>
    Escribinos a{" "}
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-ink">
      {CONTACT_EMAIL}
    </a>
    .
  </>
) : (
  <>Pedíselo al equipo que administra Herramientas en {STUDIO}.</>
);

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "Qué es Herramientas",
    body: (
      <>
        <p>
          Herramientas es la aplicación interna de {STUDIO} para su equipo: tarjetas con tipografía, emojis, GIFs,
          conversor de archivos y redacción.
        </p>
        <p>
          Se puede usar sin cuenta. Si iniciás sesión con Google, lo tuyo se guarda también en tu cuenta para que lo
          veas en cualquier computadora. Solo pueden crear una cuenta los mails @{STUDIO_DOMAIN}.
        </p>
      </>
    ),
  },
  {
    title: "Qué datos guardamos",
    body: (
      <ul>
        <li>
          <strong>Tu cuenta.</strong> El nombre, el mail y la foto que comparte Google cuando iniciás sesión. Tu
          contraseña nunca pasa por acá: la maneja Google.
        </li>
        <li>
          <strong>Lo que hacés en la app.</strong> Tus favoritos y recientes de emojis, los ajustes de cada herramienta,
          tus redacciones (título, texto y cliente) y los emojis y hashtags que guardás para cada cliente. En Tarjetas,
          cada tarjeta que creás queda a tu nombre.
        </li>
        <li>
          <strong>Visitas.</strong> Qué página abrís, de qué sitio venías (solo el dominio), tu navegador, el país
          aproximado y, si iniciaste sesión, tu cuenta. Para contar personas distintas usamos además un identificador
          anónimo. <strong>No guardamos tu dirección IP.</strong>
        </li>
        <li>
          <strong>En tu navegador.</strong> Una copia de tus preferencias y redacciones, para que todo cargue al instante
          y funcione sin cuenta. Al cerrar sesión se borra de ese navegador lo que ya está guardado en tu cuenta.
        </li>
      </ul>
    ),
  },
  {
    title: "Para qué los usamos",
    body: (
      <p>
        Solo para que la app funcione —mostrarte lo tuyo y sincronizarlo entre computadoras— y para saber cuánto se usa
        cada herramienta. No los vendemos, no los usamos para publicidad y no los compartimos con nadie fuera de los
        servicios que hacen funcionar la app.
      </p>
    ),
  },
  {
    title: "Quién más los procesa",
    body: (
      <ul>
        <li>
          <strong>Supabase:</strong> la base de datos y el inicio de sesión. Ahí se guardan tu cuenta, tus preferencias,
          tus redacciones y las visitas.
        </li>
        <li>
          <strong>Vercel:</strong> donde está alojada la app.
        </li>
        <li>
          <strong>Google:</strong> el inicio de sesión con tu cuenta y el almacenamiento de las imágenes de los emojis
          (sin datos tuyos).
        </li>
        <li>
          <strong>OpenAI:</strong> cuando buscás en Emojis, el texto que escribís puede enviarse para encontrar emojis por
          significado. Solo viaja la búsqueda.
        </li>
        <li>
          <strong>FreeConvert:</strong> los archivos que convertís o comprimís en el Conversor van directo a FreeConvert
          para procesarse.
        </li>
      </ul>
    ),
  },
  {
    title: "Cookies",
    body: (
      <p>
        Usamos las cookies de la sesión, para que sigas conectado, y una cookie anónima (<code>vid</code>, dura un año)
        para contar visitas. No usamos cookies de publicidad ni de seguimiento de terceros.
      </p>
    ),
  },
  {
    title: "Cuánto tiempo",
    body: (
      <>
        <p>Lo de tu cuenta, mientras la cuenta exista. Las visitas, para las estadísticas internas del estudio.</p>
        <p>
          Si pedís que borremos tu cuenta, se borran también tus preferencias y tus redacciones. Las tarjetas que creaste
          siguen en el tablero compartido y tus visitas quedan en las estadísticas, pero sin tu nombre.
        </p>
      </>
    ),
  },
  {
    title: "Tus derechos",
    body: <p>Podés pedir ver qué datos tenemos tuyos, corregirlos o borrarlos. {contact}</p>,
  },
  {
    title: "Cambios",
    body: <p>Si cambia algo de esto, lo actualizamos en esta página y cambia la fecha de arriba.</p>,
  },
];

export default function PrivacidadPage() {
  return (
    <div className="bg-cream text-ink">
      <header className="grain overflow-hidden bg-ink text-cream">
        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-32 sm:px-8 md:pb-24">
          <p className="site-label text-cream/60">
            {STUDIO} <span className="text-primary">\</span> Política de privacidad
          </p>
          <h1 className="mt-6 max-w-4xl font-display text-[clamp(3rem,8.5vw,7.5rem)] leading-[0.92] tracking-[-0.025em] duration-1000 animate-in fade-in-0 slide-in-from-bottom-6">
            Qué guardamos, <em className="text-cream/50">y por qué.</em>
          </h1>
          <p className="site-label mt-10 text-cream/45">Última actualización · {UPDATED}</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
        <ol className="border-t border-ink/20">
          {SECTIONS.map((section, i) => (
            <li key={section.title} className="grid gap-4 border-b border-ink/20 py-10 md:grid-cols-[12rem_1fr] md:gap-10 md:py-14">
              <p className="site-label pt-2 tabular-nums text-ink/45">{String(i + 1).padStart(2, "0")}</p>
              <div>
                <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] leading-[1.02] tracking-[-0.015em]">{section.title}</h2>
                <div className="site-prose mt-6 max-w-2xl">{section.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter />
    </div>
  );
}
