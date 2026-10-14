# Herramientas

Un solo lugar para las herramientas del día a día del estudio:

| Módulo | Ruta | Qué hace |
| --- | --- | --- |
| Inicio | `/` | Portada con todas las herramientas y el ingreso con Google |
| **Tarjetas** | `/tarjetas` | Textos con su formato y su tipografía, listos para pegar |
| **Emojis** | `/emojis` | Emojis de Apple en PNG: buscás en español o inglés y copiás con un click |
| **GIF** | `/gif` | Banners animados a partir de frames (lo que antes era Programática) |
| **Conversor** | `/conversor` | Convertir y comprimir archivos con FreeConvert |
| **Redacción** | `/redaccion` | Escribir textos con formato y con los emojis y hashtags de cada cliente a un click, y copiarlos al toque |
| **Clientes** | `/clientes` | Cada cliente con su logo, sus colores y sus tipografías, y todo lo que tiene a su nombre |
| **Descargas** | `/descargas` | Bajar videos y fotos de YouTube, Instagram y Pinterest con el link, con o sin audio, a la compu o a Drive |

La política de privacidad está en `/privacidad`. Inicio y Privacidad tienen su propia estética, editorial (negro, crema y la serif Instrument Serif): `app/page.tsx`, `app/privacidad/page.tsx` y `components/site/`. El mail de contacto de la política se define en `lib/site.ts`.

---

## Cómo se usa: sidebar + barra contextual

- **La píldora negra de arriba a la izquierda** abre la sidebar flotante con los módulos. Ahí se navega; `Esc` la cierra.
- **La barra flotante del centro** cambia según el módulo: es desde donde se hace todo (buscar, filtrar, agregar, exportar, configurar). Al pasar de un módulo a otro se transforma en lugar de recargarse.
- Los botones son íconos; si dejás el mouse un segundo encima aparece su nombre.
- `/` enfoca el buscador del módulo, en cualquier momento.
- **El avatar de arriba a la derecha** es la cuenta: iniciar sesión con Google o cerrarla (ver "Cuentas y visitas").

### Diseño

La app sigue la estética de Inicio (en la línea de tbwa.com): fondo crema, texto negro tinta, tarjetas en papel y el amarillo de marca solo como acento (acciones principales, foco y la barra invertida `\`). Los títulos van en Instrument Serif (`font-display`, se carga para toda la app en `app/layout.tsx`) y las etiquetas en mayúscula espaciada (`.eyebrow`).

- Los colores son variables en `app/globals.css` (`--background`, `--card`, `--primary`…); en Tailwind también están `ink` y `cream` para usarlos directo.
- Superficies flotantes: `.floating` (clara, para popovers y paneles) y `.floating-ink` (negra, para la píldora de módulos, la barra contextual, la cuenta y la sidebar).

La barra está en `components/shell/ContextBar.tsx`: cada página monta `<ContextBar>` con sus controles y estos se "teletransportan" a la barra del layout. Sus piezas (`BarButton`, `BarSearch`, `BarSegmented`…) ya vienen pensadas para fondo negro.

---

## Puesta en marcha

```bash
npm install
cp .env.local.example .env.local   # y completá los valores
npm run dev
```

Abrí http://localhost:3000

### Variables de entorno

| Variable | Módulo | Obligatoria |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tarjetas, cuentas y visitas | Sí, para Tarjetas y para iniciar sesión |
| `FREECONVERT_API_KEY` | Conversor | Sí, para convertir |
| `OPENAI_API_KEY` | Emojis | No: sin ella se busca solo por palabras |
| `EMOJI_STORAGE_BUCKET` | Emojis | No (por defecto `camara-focus.firebasestorage.app`) |
| `RESEND_API_KEY` | Inicio → Sugerencias | No: sin ella no llega el mail, pero las sugerencias igual quedan en el tablero (`FEEDBACK_TO` y `FEEDBACK_FROM` son opcionales) |
| `YOUTUBE_WORKER_SECRET`, `BLOB_READ_WRITE_TOKEN` | Descargas → YouTube | Sí, para YouTube: la clave del servicio de la PC y el Blob store donde anota su dirección (ver "Descargas"). `YOUTUBE_WORKER_URL` es opcional: una dirección fija (en local, `http://localhost:8787`) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_PICKER_API_KEY` | Descargas → Drive | Sí, para guardar en Drive (el client id es el mismo de Planificación) |

Las que no empiezan con `NEXT_PUBLIC_` viven solo en el servidor. En Vercel se cargan en **Settings → Environment Variables**.

### Sugerencias y errores

Al final del Inicio hay un formulario para mandar una **idea** o avisar un **error**. Se guarda en la base (`supabase/migracion-sugerencias.sql`) y, con sesión del estudio, se ve debajo en **el tablero**: post-its amarillos (ideas) y rojos (errores), sueltos e inclinados. Cada post-it muestra el principio del texto; al tocarlo se abre entero.

- **Firmar o no:** con sesión se manda firmada con el nombre y la foto de la cuenta, o anónima (el nombre no se muestra en el tablero). Sin sesión también se puede mandar (así se puede avisar "no puedo entrar"), anónima o con el nombre que se escriba, pero el tablero no se ve. Las anónimas sin sesión tienen un tope de 10 por minuto entre todas.
- **Me sumo / Me pasa también:** cada persona del estudio puede apoyar una idea o un error una vez.
- **Estado:** quien administra (`feedback_admins`, hoy `fmachado@camaratbwa.com`) marca *En camino* o *Hecha*; las hechas quedan al final, más claras. Cada uno puede borrar las suyas y quien administra, cualquiera.
- **Mail (opcional):** si está `RESEND_API_KEY`, además llega un mail a `fmachado@camaratbwa.com` (`FEEDBACK_EMAIL` en `lib/site.ts`, o `FEEDBACK_TO`). Para activarlo: crear una cuenta en [Resend](https://resend.com) **con el mismo mail que recibe**, sacar una API key y cargarla como `RESEND_API_KEY` en `.env.local` y en Vercel. Sin dominio verificado, Resend manda desde `onboarding@resend.dev` y solo al mail de su cuenta; para mandar a otro mail o desde una dirección propia, verificar un dominio en Resend y completar `FEEDBACK_FROM`.

---

## Entornos: producción y testing

| | Producción | Testing |
| --- | --- | --- |
| Rama | `main` | `testing` |
| URL | `brand-assets-center.vercel.app` | `brand-assets-center-testing.vercel.app` (dominio vinculado a la rama) |
| Supabase | Brand Assets Center (`eqzcpacqlwvowugmeads`) | FMachado8599's Project (`xsxbrhkorqudwnimkfho`) |

**El flujo:** cada cambio se mergea a `testing`, se prueba en su URL y, recién cuando está todo bien, `testing` se mergea a `main`. Las migraciones de `supabase/` se corren primero en la base de testing y después en producción.

**En Vercel** (plan Hobby, sin entornos personalizados) testing es el Preview de la rama `testing`:

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están cargadas para *Preview* solo en la rama `testing`, apuntando a la base de testing.
- Las demás claves (FreeConvert, OpenAI, Resend) también tienen que estar en *Preview*; si no, el Conversor, la búsqueda por significado y el mail de Sugerencias no andan en testing.
- Los previews piden iniciar sesión en Vercel (Deployment Protection). En Hobby esa sesión solo la tiene el dueño del proyecto.

**Armar una base de testing de cero:**

1. Correr en orden `schema.sql`, `migracion-usuarios.sql`, `migracion-redaccion.sql`, `migracion-clientes.sql`, `migracion-acceso.sql` y `migracion-sugerencias.sql`.
2. En *Authentication → Sign In / Providers → Google*, activar Google con el mismo cliente OAuth de producción. En Google Cloud, sumar `https://<proyecto>.supabase.co/auth/v1/callback` a los *Authorized redirect URIs* de ese cliente.
3. En *Authentication → URL Configuration*, poner la URL de testing como *Site URL* y sumar `https://brand-assets-center-testing.vercel.app/**` y `http://localhost:3000/**` a las *Redirect URLs*.

**Datos de testing:** una copia del catálogo de producción del 2026-10-12 (clientes, productos, categorías, tarjetas y tipografías; las fuentes siguen apuntando a los archivos de producción). No tiene cuentas, redacciones ni visitas.

**Otra tabla en producción:** `emojis_search` y `match_emojis` (la búsqueda semántica de camara-focus-v2, 1949 emojis con vectores) quedaron guardadas en la base de producción. Herramientas no las usa: su buscador lee `data/emojis/embeddings.json`.

---

## Cuentas y visitas

Las herramientas son solo para el estudio: para usarlas hay que iniciar sesión con Google con una cuenta **@camaratbwa.com** (ver "Quién puede entrar"). Inicio y Privacidad son públicas. Lo personal se guarda en Supabase y aparece en cualquier computadora:

- Favoritos y recientes de emojis.
- Ajustes de Emojis, GIF y Conversor.
- Redacciones, y los emojis y hashtags de cada cliente.
- Las tarjetas que creás quedan a tu nombre y en Filtros aparece **Solo mis tarjetas**. El tablero sigue siendo compartido: todos ven y editan todo, como antes.

Al iniciar sesión, lo guardado en la cuenta manda; si la cuenta todavía no tiene algo, se sube lo que había en el navegador. Hasta leer la cuenta no se escribe nada en ella, así nunca se pisa lo guardado desde otra computadora: si no se puede leer, se reintenta y, si sigue fallando, avisa. Al cerrar sesión se borra la copia del navegador de todos los módulos (no solo del que está abierto), así el próximo que use esa computadora no ve tus cosas.

El autor de cada tarjeta lo pone la base al crearla y después no se puede cambiar.

### Activarlo (una sola vez)

1. **Base**: en Supabase → SQL Editor, corré `supabase/migracion-usuarios.sql`. Crea `profiles`, `user_prefs`, `visits`, el autor de las tarjetas y las vistas de visitas. Después corré `supabase/migracion-redaccion.sql` (la tabla `redacciones`).
2. **Google**: en [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID** → tipo **Web application**.
   - *Authorized JavaScript origins*: `http://localhost:3000` y la URL de producción.
   - *Authorized redirect URIs*: `https://<tu-proyecto>.supabase.co/auth/v1/callback` (la URL de tu proyecto de Supabase + `/auth/v1/callback`).
   - Si te pide configurar la pantalla de consentimiento (*Google Auth Platform*), alcanza con el tipo **External** y tu mail como contacto.
   - En **Branding** completá nombre, mail de soporte, *Application home page* (`https://<tu-dominio>/`), *Privacy policy* (`https://<tu-dominio>/privacidad`) y tu dominio en *Authorized domains*.
   - En **Audience**, publicala (*In production*): así cualquier cuenta de Google puede intentar entrar y quién entra lo decide la base (ver "Quién puede entrar"). Si queda en *Testing*, Google solo deja entrar a los *Test users*.
3. **Supabase → Authentication → Sign In / Providers → Google**: activalo y pegá el *Client ID* y el *Client Secret* de Google.
4. **Supabase → Authentication → URL Configuration**:
   - *Site URL*: la URL de producción.
   - *Redirect URLs*: `http://localhost:3000/**` y `https://<tu-dominio>/**`. Para los previews de Vercel, también `https://*-<tu-equipo>.vercel.app/**`.
   - Van con `/**` porque la vuelta del login lleva `?next=…` (la página desde la que entraste): con la URL exacta, Supabase puede rechazarla y mandarte a la *Site URL*.

5. **Acceso**: corré `supabase/migracion-acceso.sql` (ver "Quién puede entrar").

Si Google no está activado, el botón "Continuar con Google" avisa qué falta en lugar de mandar a una página de error.

### Quién puede entrar

Solo entran las cuentas **@camaratbwa.com** y las de la lista de excepciones. Hay tres capas:

1. **La base** (`supabase/migracion-acceso.sql`): no crea cuentas de otros dominios, y tarjetas, clientes (y sus logos), productos, categorías y tipografías solo se leen y editan con sesión del estudio. Es la protección real: sin ella, cualquiera con la clave pública podría leer y editar todo.
2. **Las páginas** (`middleware.ts`): sin sesión, las herramientas mandan a Inicio con "Iniciá sesión con tu cuenta @camaratbwa.com" y, después de entrar, vuelven a la herramienta que se quería abrir. A una cuenta de afuera le cierra la sesión y le avisa "Esa cuenta no tiene acceso".
3. **Las APIs**: sin sesión del estudio responden 401, así nadie de afuera usa el Conversor ni la búsqueda de emojis (cuestan plata). Quedan públicas Inicio, Privacidad, la vuelta del login, las visitas y las imágenes de emojis.

- **Excepciones** (ej: un freelance): en el SQL Editor, `insert into public.allowed_emails (email, note) values ('alguien@gmail.com', 'Freelance');`, con el mail en minúsculas. Si vos entrás con una cuenta que no es @camaratbwa.com, agregala acá o te quedás afuera.
- **Sacarle el acceso a alguien**: borrarlo de `allowed_emails` (y, si querés, su usuario en Supabase → Authentication → Users).
- **Ojo:** el correo de @camaratbwa.com no es de Google (está en `mail.camaratbwa.com`). Para entrar con Google, cada persona necesita una cuenta de Google creada con su mail de trabajo: al crear la cuenta, la opción "Usar mi dirección de correo electrónico actual".

### Visitas

Cada página que se abre queda anotada en la tabla `visits` (desde `/api/visits`): con el usuario si había sesión, o como invitado con un id anónimo (cookie `vid`, un año) para contar personas distintas. No se guarda la IP; sí el país (en Vercel), el navegador y de qué sitio venían. Los bots se ignoran.

Desde la app no se pueden leer: se consultan en el SQL Editor de Supabase.

```sql
select * from visitas_por_dia;      -- visitas, invitados y usuarios distintos por día
select * from visitas_por_usuario;  -- quién entra y cuándo fue la última vez
```

---

## Emojis

Cerca de 1850 emojis de Apple, con nombres y etiquetas **en español y en inglés**, agrupados por categoría.

**Al entrar** se ven tus **favoritos**, los **recientes** (los últimos 16 que copiaste o bajaste) y las **categorías** (cada una con su primer emoji de portada). No se carga ningún listado hasta que elegís una categoría o buscás.

- **Categoría** (`/emojis?c=…`): trae los emojis de a 60 con **Cargar más**. Mientras llegan se ve un esqueleto y la página aparece entera, de una, cuando cargaron todas sus imágenes. El botón "atrás" del navegador vuelve al inicio.
- **Búsqueda**: el esqueleto aparece en cascada y los emojis lo van reemplazando **en orden** (izquierda a derecha, arriba a abajo), a medida que cargan.
- **Click** en un emoji → copia el PNG al portapapeles (o el carácter, si lo cambiás en ajustes).
- **Buscar + Enter** → copia el primer resultado sin tocar el mouse (si la búsqueda todavía no llegó, lo copia apenas llega).
- Al pasar el mouse: ⭐ favorito, ⬇ descargar PNG, ✓ seleccionar.
- **Ctrl + click** (o el ✓) selecciona varios: la barra ofrece bajarlos en un **ZIP** o copiarlos como texto.
- **Tono de piel** global (manos y personas) y **tamaño del PNG** (128, 256, 512 o el original de 1000 px).
- Arrastrar un emoji al escritorio guarda el PNG grande (Chrome).
- Favoritos, recientes y ajustes se guardan en `localStorage` (sobreviven a cerrar la pestaña, a diferencia de `sessionStorage`). Los recientes se borran desde Ajustes.

### De dónde sale cada cosa

- **Catálogo** (`data/emojis/catalog.json`): se genera con `npm run emojis:catalog` cruzando `emoji-datasource` (códigos y tonos), `emojibase-data` (nombres y etiquetas en español/inglés) y la lista de archivos que existen en Storage (`scripts/emojis/storage-ids.json`). Ya no depende de Firestore. Vive solo en el servidor: el navegador pide páginas a `/api/emojis?group=…&cursor=…` (o `?ids=…` para los favoritos) y a `/api/emojis/search?q=…&cursor=…`.
- **Imágenes**: siguen en el Firebase Storage del proyecto anterior (`emojis/apple/*.png` de 1000 px y `emojis/apple-placeholders/*.webp` de 100 px). Se sirven a través de `/api/emojis/img/[id]`, porque el CORS del bucket solo acepta los dominios viejos y porque Firebase no deja cachearlas; el proxy las marca como inmutables y la CDN las guarda.
- **Imágenes rotas**: al migrar se compararon las 3796 imágenes contra las oficiales de Apple. 151 estaban mal en Storage (un "?", el emoji partido en dos o recortado): son las de Emoji 15.0/15.1 (🫨 🩷 🪿 🛜 ⛓️‍💥, las personas "hacia la derecha", etc.). Están listadas en `scripts/emojis/broken-ids.json` y no se muestran. Si se suben bien a Storage, se borran de esa lista y se regenera el catálogo.

### Búsqueda

Dos capas que se mezclan:

1. **Por palabras**: nombres y etiquetas en los dos idiomas, sin acentos, con prioridad para los emojis más usados.
2. **Por significado** (opcional): la consulta se convierte en un vector con OpenAI (`text-embedding-3-small`) y se compara contra el de cada emoji. Así "festejo" encuentra 🎉 aunque la palabra no esté en sus etiquetas.

Para activar la segunda:

1. Agregá `OPENAI_API_KEY` en `.env.local` (y en Vercel).
2. Corré `npm run emojis:embeddings` una vez: genera `data/emojis/embeddings.json` (~1 MB, cuesta menos de un centavo de dólar). Commitealo.

Si te olvidás del paso 2 funciona igual: el servidor calcula el índice en memoria en la primera búsqueda (tarda unos segundos esa vez).

---

## GIF (ex Programática)

Soltás todos los frames juntos y sale un GIF por banner. Todo pasa en el navegador: las imágenes no se suben a ningún lado.

**Cómo nombrar los archivos:** `[prefijo_]ANCHOxALTO_ORDEN[-DURACIÓN].ext`

```
300x250_1.jpg           frame 1, duración por defecto
300x250_2-1.5s.jpg      frame 2, 1,5 segundos
728x90-1-800ms.png      guion o guion bajo, en segundos o milisegundos
verano_300x600_1.jpg    el prefijo separa campañas con la misma medida
```

- Se agrupan por medida (y prefijo) y se ordenan por número. Avisa si falta un frame, si hay uno repetido o si una imagen no tiene la proporción del nombre.
- En **Frames** de cada grupo se cambia la duración de cada uno, se reordenan o se quitan.
- **Ajustes** (en la barra): duración por defecto, loop, calidad (cantidad de colores), **peso máximo** y **ajustar al peso máximo**.
- **Exportar** baja todos en un ZIP; cada tarjeta también baja su GIF suelto. Una vez generado, la tarjeta muestra el **GIF final** (con su compresión real), no los frames originales.

### Compresión

- Desde el segundo frame, los píxeles que no cambian se guardan transparentes: el GIF deja el que ya estaba. En el caso típico (misma foto, cambia el texto) eso baja el peso entre 40 y 60 % sin perder calidad.
- Con **ajustar al peso máximo** activo, si un GIF se pasa del límite se prueba con menos colores (192 → 160 → 128 → 96 → 64 → 48 → 32) hasta que entre. La tarjeta muestra con cuántos colores quedó y avisa en ámbar si bajó a 48 o menos, porque ahí los degradés pueden verse escalonados. Si ni con 32 entra, queda en rojo.

Probado con 6 banners de 2–3 frames (300x250, 300x600, 728x90, 160x600, 320x50, 970x250): GIF válidos, duraciones y loop correctos, y todos dentro de 150 KB.

Respecto de Programática se corrigió: la guía decía `300x600_1.jpg` pero solo se aceptaba `300x600-1.jpg`; "Agregar más" reemplazaba todo en vez de sumar; la duración por defecto no se actualizaba en los frames ya cargados; y la vista previa ignoraba los milisegundos.

---

## Redacción

Un lugar para escribir rápido (posteos, copys, mails) y sacar el texto más rápido todavía.

- **Formato**: negrita, cursiva, subrayado, tachado, listas y mayúsculas/minúsculas, desde la barra de arriba del texto o con los atajos de siempre (ver la tabla). Pegar desde Word o Docs conserva negritas y cursivas; pegar texto común respeta las líneas vacías. Los `#hashtags` y las `@menciones` se pintan.
- **Nombre**: cada redacción se llama como su primera línea hasta que le pongas uno. Si lo borrás, vuelve al automático.
- **Cliente**: cada redacción puede tener uno (la misma lista de Tarjetas y Clientes). Si no está, se crea desde el mismo selector con **Nuevo cliente…**. Una nueva sigue con el cliente de la anterior.
- **A la izquierda** (en pantallas chicas, en la barra), dos pestañas:
  - **Recientes**: todas, de la más nueva a la más vieja, con nombre, cliente y hace cuánto se editó. Se buscan por nombre, texto o cliente.
  - **Clientes**: cada cliente con sus redacciones (de la más nueva a la más vieja; arriba el que tiene la más reciente). Se filtran escribiendo el nombre, o tocando un cliente para ver solo las suyas. Con el **+** de cada cliente se empieza una nueva para él.
- Se guarda todo solo, mientras escribís.

### Copiar

El botón amarillo de la barra (o `Ctrl + Enter`) copia con formato: donde se entiende (Docs, Word, un mail) llega con negritas y listas; donde no (Instagram, WhatsApp), llega el texto. En **Exportar**:

| Opción | Para qué |
| --- | --- |
| Copiar sin formato | Solo el texto (las listas con `•` y `1.`) |
| Copiar para WhatsApp | `*negrita*`, `_cursiva_` y `~tachado~`, que WhatsApp muestra con formato |
| Copiar para Instagram / LinkedIn | La negrita y la cursiva con letras especiales (𝗻𝗲𝗴𝗿𝗶𝘁𝗮, 𝘤𝘶𝘳𝘴𝘪𝘷𝘢), porque ahí no hay formato. Los hashtags, menciones y links quedan normales para que sigan funcionando. Ojo: los lectores de pantalla las leen mal; usarlas para resaltar, no para párrafos enteros |
| Copiar sin hashtags / solo los hashtags | Para cuando los hashtags van en el primer comentario |
| Descargar .txt · Compartir | El texto, como archivo o al menú de compartir del celular |

### Emojis y hashtags

Las dos burbujas al costado del texto (☺ y #) abren un panel. Arriba del panel se elige de qué cliente mostrar: arranca en el del texto, pero se puede cambiar para ver o cargar los de otro sin tocar el texto (un aviso indica que no es el del texto, con **Volver**).

- **Emojis**: una versión chica del módulo Emojis: buscar, los fijados del cliente, recientes, favoritos (los mismos que en `/emojis`, con el mismo tono de piel) y, al final, las categorías. Click inserta donde está el cursor, sin sacarte del texto. Con el **+** de cada emoji queda fijado en el cliente.
- **Hashtags**: los del cliente (uno o todos de un click: inserta solo los que faltan), los que ya escribiste en este texto (con un botón para guardarlos en el cliente) y los recientes de tus otras redacciones.

### Atajos

| Atajo | Qué hace |
| --- | --- |
| `Ctrl + B` · `Ctrl + I` · `Ctrl + U` | Negrita, cursiva, subrayado |
| `Ctrl + Shift + S` | Tachado |
| `Shift + F3` | minúsculas → MAYÚSCULAS → Capitalizar (como en Word). Sin selección, cambia la palabra del cursor |
| `Ctrl + Shift + 8` · `Ctrl + Shift + 7` | Lista con viñetas, lista numerada |
| `Ctrl + \` | Quitar formato |
| `:` + nombre | Sugiere emojis mientras escribís (`:fuego` → 🔥) |
| `#` | Sugiere los hashtags del cliente del texto (si no tiene, los de todos) y los recientes |
| `Ctrl + E` · `Ctrl + H` | Abren la lista de emojis o de hashtags donde está el cursor |
| `↑ ↓` · `Enter` / `Tab` · `Esc` | Elegir, insertar, cerrar |
| `Ctrl + Enter` | Copiar todo el texto |

Si un hashtag ya está escrito entero, `Enter` hace un salto de línea en vez de elegirlo. Las sugerencias de emojis usan `/api/emojis/search?modo=palabras` (sin la búsqueda por significado: tiene que responder letra por letra).

### Dónde se guarda

- **Sin sesión**: en el navegador (`localStorage`).
- **Con sesión**: además, cada redacción en la tabla `redacciones` (`supabase/migracion-redaccion.sql`: el texto con formato y el texto plano) y los emojis/hashtags de cada cliente en `user_prefs`. Al entrar desde otra computadora aparece todo. Entre dos computadoras gana la edición más nueva (la base no deja que una versión vieja pise a una más nueva). Lo escrito sin sesión se sube a la cuenta con la que entrás.
- Al cerrar sesión se borra la copia del navegador si ya estaba toda en la cuenta. Si quedó algo sin subir (por ejemplo, porque falta la tabla), se guarda sin mostrarse hasta que vuelvas a entrar.
- Abajo a la derecha del editor se ve el estado: *En este navegador*, *Guardando…*, *Guardado en tu cuenta* o *Sin respaldo* (no se pudo guardar en la cuenta; se reintenta solo).

---

## Clientes

Todo lo de cada cliente en un solo lugar. Son la tabla `brands` de siempre (en Tarjetas se llamaban marcas).

- **Crear uno, desde cualquier lado**: el **+** de Clientes en la sidebar, **Nuevo cliente** en Clientes, **+ Nuevo** al lado del cliente en el editor de una tarjeta, o **Nuevo cliente…** en el selector de Redacción. Pide nombre, color y, si lo tenés, el logo: el color se saca solo del logo. El cliente nuevo queda elegido donde lo creaste y aparece al instante en los otros módulos. Si ya existe uno con ese nombre (sin importar mayúsculas ni acentos), ofrece usar ese.
- **La lista** (`/clientes`): cada cliente con su logo (o sus iniciales), su paleta y cuánto tiene a su nombre.
- **La ficha** (`/clientes/<id>`), donde se edita todo y se guarda solo:
  - **Logo**: se suelta o se elige (SVG, PNG, JPG, WEBP o GIF, hasta 5 MB). Se elige sobre qué fondo se ve (claro, oscuro o su color: un logo blanco no se ve sobre papel), y se descarga o se cambia desde ahí.
  - **Nombre, color y notas**: el color es el que lo identifica en las listas. Las notas son libres (tono, contactos, links).
  - **Colores**: la paleta, con nombre para cada color. Un click copia el HEX (o el RGB). Si hay logo, sugiere sus colores para sumarlos de un click. La estrella marca el color del cliente.
  - **Tipografías**: se eligen entre las subidas, se suben ahí mismo (quedan en la biblioteca de Tarjetas) o se anota una que todavía no está. Cada peso se copia con su nombre completo, como lo nombran Illustrator e InDesign.
  - **Productos**: se agregan y se quitan ahí.
  - **Tarjetas** y **Redacciones**: las suyas, con atajos para crear una nueva para el cliente. Las redacciones son las tuyas (las de los demás no se ven).
  - **Emojis y hashtags**: los que guardaste para el cliente desde los paneles de Redacción. Un click copia.
  - **Eliminar cliente**: borra su ficha, su logo y sus productos. Las tarjetas y las redacciones quedan, sin cliente.

### Activarlo (una sola vez)

En Supabase → SQL Editor, corré `supabase/migracion-clientes.sql`. Suma a `brands` el logo, el fondo del logo, la paleta, las tipografías y las notas, y crea el bucket público `logos`. Se puede correr antes o después de `migracion-acceso.sql` (las dos dejan los logos solo para el estudio) y más de una vez. Sin ella, Clientes muestra todo pero avisa que no puede guardar la ficha.

---

## Tarjetas

Guarda textos con su formato y su tipografía, y los copia listos para pegar.

- Tarjetas con texto enriquecido (negrita, cursiva, subrayado, listas, tamaño)
- Cambio de caja: MAYÚSCULAS, minúsculas y Capitalizar Cada Palabra — reescribe las letras de verdad, así viajan bien al portapapeles
- **Cada fragmento guarda su tipografía exacta**, incluido el peso: "Montserrat Light" y "Montserrat Bold" conviven en el mismo párrafo
- Subida de archivos de fuente (`.woff2`, `.woff`, `.ttf`, `.otf`) con detección automática de familia y peso
- Clasificación por **cliente**, **producto** (el modelo dentro del cliente) y **categoría**, con filtros de selección múltiple (en la barra, ícono de filtros)
- Las tarjetas se agrupan solas: el cliente es una columna (con su logo y un link a su ficha) y cada producto abre su propia fila
- Copiar con formato · Copiar sin formato · Descargar `.rtf` / `.svg`

### Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. **SQL Editor** → **New query** → pegá el contenido de `supabase/schema.sql` → **Run**.
3. **Project Settings → API**: copiá **Project URL** y la key **anon public** a `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

> Si ya habías corrido una versión anterior de `schema.sql`, corré `supabase/migracion-productos.sql`: agrega la tabla de productos, la columna `product_id` en las tarjetas y la columna que marca las fuentes variables.

Eso crea las tablas, los permisos y el bucket `fonts` para los archivos de tipografía.

### Clientes, productos y categorías

Son tres clasificaciones independientes que se cruzan:

- **Cliente** — Changan, por ejemplo. Se crean y se editan en [Clientes](#clientes) (o con **+ Nuevo** en el editor de la tarjeta); ya no están en Ajustes.
- **Producto** — el modelo dentro de ese cliente: Lumin, Hunter, Eado, CS55, Q05. Un producto siempre pertenece a un cliente, así que el selector de producto solo te ofrece los modelos del cliente elegido, tanto al crear una tarjeta como al filtrar. Se cargan en la ficha del cliente o en Ajustes → Productos.
- **Categoría** — transversal a todos los clientes: Autonomía, Seguridad, Tecnología.

Las tarjetas se ordenan solas en dos niveles. El cliente es una columna, y adentro cada producto abre un divisor con su nombre a la izquierda y sus tarjetas en fila. El encabezado del cliente aparece solo cuando hay más de uno a la vista. Las tarjetas sin producto quedan al final bajo "Sin producto".

Desde la ficha de un cliente, `/tarjetas?cliente=<id>` abre Tarjetas filtrado por él y `/tarjetas?nueva=<id>` abre una tarjeta nueva con él elegido. Borrar un cliente borra también sus productos; las tarjetas sobreviven, quedan sin cliente.

### Cómo pegar en Illustrator conservando la tipografía

**La condición que no se puede saltear:** Illustrator usa las fuentes instaladas en la computadora, no las del navegador. Si en la tarjeta hay "Montserrat Light", esa fuente tiene que estar instalada en la máquina donde pegás.

- **Copiar** (el botón principal) pone HTML con fuente, peso, tamaño y estilo por fragmento. Funciona muy bien en Word, Google Docs, InDesign y Figma. En Illustrator no conserva los cambios de peso dentro de una misma línea: es una limitación del portapapeles, no de la app.
- **Descargar .svg** (menú `···`) es el mejor camino a Illustrator: cada fragmento sale como un `<tspan>` con su propia `font-family` y entra como texto vivo y editable, con cada peso en su lugar.
- **Descargar .rtf** sirve para InDesign y Word: **Archivo → Colocar**, destildando "Eliminar formato de texto".

### Cómo se cargan las tipografías

**Ajustes** (engranaje de la barra) → pestaña **Tipografías** → seleccioná todos los archivos de la familia de una vez.

**No se elige ni el peso ni el estilo.** La app lee los metadatos reales de la fuente (tablas `name`, `fvar` y `OS/2`), así que familia, estilo y peso salen de adentro del archivo. Con `.woff2` se deduce por el nombre y el grupo queda marcado como "Deducido del nombre". Cada peso en la cola se previsualiza con su propio archivo antes de guardar.

**Fuentes variables:** un archivo como `Montserrat-VariableFont_wght.ttf` trae todos los pesos. La app los muestra para que elijas cuáles registrar; cada uno queda fijado con `font-variation-settings`. Para Illustrator conviene instalar los pesos estáticos (carpeta `static/` del .zip de Google Fonts).

Cada archivo se registra con su **nombre completo** ("Montserrat Light") como si fuera una fuente independiente: así el navegador nunca inventa una negrita falsa y el nombre coincide con el que usan Illustrator e InDesign. Si el texto está en Light y apretás **negrita**, la app cambia al archivo Bold si lo subiste.

### Sobre el acceso

Ven y editan todo quienes iniciaron sesión con una cuenta del estudio: `supabase/migracion-acceso.sql` reemplaza las políticas `acceso abierto` de `schema.sql` por "solo el estudio". Si más adelante querés tarjetas privadas, se puede sumar una política basada en `auth.uid()` y `owner_id`.

---

## Conversor

Conversor y compresor de archivos con la API de [FreeConvert](https://www.freeconvert.com/api/v1/).

- **Convertir / Comprimir** se elige en la barra. Los formatos posibles se leen en vivo de FreeConvert para cada archivo.
- **Opciones avanzadas** (ícono de ajustes en cada archivo): el formulario se arma con el esquema que publica FreeConvert para ese par de formatos. Las etiquetas vienen de la API, en inglés.
- **Configuración** (en la barra): archivos en paralelo y formato preferido por tipo (imágenes, videos, audio, documentos).

Necesita `FREECONVERT_API_KEY` (sacala en [freeconvert.com/api](https://www.freeconvert.com/api)). La key vive solo en el servidor (`app/api/freeconvert/*`): el navegador recibe un formulario de subida firmado y manda el archivo directo a FreeConvert, así que los archivos grandes no pasan por Vercel. Cada conversión consume minutos de tu plan.

---

## Descargas

Baja lo que hay en links de YouTube, Instagram y Pinterest, en la mejor calidad que den, a la compu, a una carpeta de Drive o a las dos.

- **Pegar links**: en la caja de la página (o en el botón de lista de la barra) entra un mensaje o una lista entera: muestra cuántos links reconoce y de qué plataforma antes de agregarlos. También anda Ctrl+V en cualquier parte de la página, el botón de pegar de la barra o escribir en la barra + Enter. Entra un link por fila; los repetidos y los de otras páginas se ignoran (y se avisa cuántos).
- **YouTube**: videos, Shorts y vivos ya terminados. Se elige la calidad en cada fila (hasta 1080p en H.264 + AAC, el MP4 que abre cualquier editor). Lo baja **el servicio de la PC de la oficina** (ver abajo): si esa PC está apagada, las filas de YouTube lo avisan.
- **Instagram**: posteos (`/p/…`), reels (`/reel/…`, también con el usuario adelante) y `/tv/…`, de cuentas públicas. Los videos salen en MP4 (720p, lo que da Instagram sin sesión), las fotos en su mayor tamaño (1080 px) y los carruseles enteros: **Descargar N** baja todo y la tira de miniaturas baja cada archivo por separado. El ícono de copiar trae el texto del posteo. Las historias no se pueden: piden sesión.
- **Pinterest**: pins de video y de imagen, de cualquier dominio (`pinterest.com/pin/…`, `ar.pinterest.com`, `pinterest.es`…) y los links cortos (`pin.it/…`). Las imágenes salen en su tamaño original.
- **Cómo se guarda** (ícono de ajustes de la barra, o el resumen debajo del título). Se recuerda en la cuenta de cada uno:
  - *Sonido de los videos*: con audio, sin audio (el video mudo) o solo audio (`.m4a`). No se vuelve a comprimir nada: se copian las pistas tal cual. En Instagram y Pinterest lo hace el navegador (`lib/downloads/audio.client.ts`, con [mediabunny](https://mediabunny.dev)); en YouTube, el servicio de la PC.
  - *Dónde*: compu, compu y Drive, o solo Drive.
  - *Carpeta de Drive*: se pega el link de la carpeta. La primera vez Google pide permiso y abre su selector ya parado en esa carpeta, para confirmarla con un click; después queda guardada.
- Los archivos se llaman como el posteo: `@cuenta - primera línea del texto.mp4` en Instagram, `Canal - Título.mp4` en YouTube y el título del pin en Pinterest; con `(3)` si es del carrusel, `(sin audio)` o `(audio)`. Con dos o más links listos aparece la acción de la barra para guardar todo junto (el navegador puede pedir permiso para descargas múltiples la primera vez).

### Cómo funciona

- `/api/descargas/info?url=…` lee el link en el servidor:
  - **Instagram** (`lib/downloads/instagram.server.ts`): abre la página *embed* del posteo (`/p/<código>/embed/captioned/`, la que usan los sitios para insertar un posteo), que trae los datos sin sesión. Solo responde si el pedido parece una navegación (`Sec-Fetch-Mode: navigate`), y el `fetch()` de Node no deja poner ese encabezado: por eso va con `node:https`. Las fotos sueltas no traen datos y se leen del HTML del embed. Las APIs internas (GraphQL, `?__a=1`) piden iniciar sesión.
  - **Pinterest** (`lib/downloads/pinterest.server.ts`): abre la página pública del pin y lee el schema.org que publica para los buscadores (`VideoObject` en los videos, `SocialMediaPosting` en las imágenes). La API interna de Pinterest pide sesión.
  - **YouTube** (`lib/downloads/youtube.server.ts`): le pide los datos al servicio de la PC con la clave compartida y firma un permiso para ese video (vence a las 6 horas). El navegador le habla directo al servicio con ese permiso: le pide que prepare el archivo, sigue el avance y lo baja de ahí. Los videos de YouTube no pasan por Vercel.
- `/api/descargas/file?src=…&name=…` baja los archivos de Instagram y Pinterest a través del servidor (edge), para que salgan con su nombre (y porque el CDN de Pinterest no habilita CORS). Solo acepta archivos de los CDN de Pinterest (`v*.pinimg.com/videos`, `i.pinimg.com/originals`) e Instagram (`*.fbcdn.net`, `*.cdninstagram.com`), y la extensión la decide el tipo que manda el origen. Cada descarga pasa por Vercel, así que consume transferencia.
- `lib/downloads/save.client.ts` arma cada guardado: de dónde sale el archivo, si hay que sacarle o separarle el audio y adónde va. Solo a la compu y sin procesar, lo baja el navegador directamente; si hay que procesarlo o subirlo a Drive, primero se baja a la memoria de la página.
- **Drive** (`lib/downloads/drive.client.ts`) usa la cuenta de Google de cada persona, con el permiso `drive.file`: la app solo ve lo que ella sube y las carpetas que la persona le confirma en el selector de Google (Google Picker). Así nadie le da acceso a todo su Drive y Google no pide verificar la app. Los archivos van directo del navegador a Google.
- Los links de archivos de Instagram vencen a los pocos días: si una fila quedó abierta mucho tiempo, sacala y volvé a pegar el link.
- **Si un día deja de andar**, lo más probable es que Instagram o Pinterest hayan cambiado su página: lo que hay que ajustar está en esos dos archivos. Instagram además puede tratar distinto a los servidores en la nube que a una conexión de oficina; si en Vercel falla y en local anda, es eso.

### YouTube: el servicio de la PC

YouTube corta las descargas en buena calidad que salen de servidores en la nube (deja bajar el primer mega y después responde 403, si el pedido no trae un token que genera su reproductor). Por eso lo baja un servicio aparte, `worker/youtube/`, con [yt-dlp](https://github.com/yt-dlp/yt-dlp) y ffmpeg, en una PC con conexión de oficina. Está en Node sin dependencias; los programas van en `worker/youtube/bin/` (fuera de git) y yt-dlp se actualiza solo cada día. Las instrucciones para instalarlo en otra PC (o en el servidor de la empresa) están en [`worker/youtube/README.md`](worker/youtube/README.md).

Para que lo alcancen Vercel y los navegadores del equipo, el servicio abre solo un **túnel de Cloudflare sin cuenta** (gratis, con `bin/cloudflared.exe`). Esa dirección (`https://<palabras>.trycloudflare.com`) cambia cada vez que arranca, así que el servicio la anota en un **Blob store de Vercel** y la app la lee de ahí (`lib/downloads/youtube.server.ts`). Nadie tiene que copiar direcciones a mano.

1. **Crear el Blob store** (una sola vez): en Vercel, **Storage → Create → Blob**, y conectarlo al proyecto (Production, Preview y Development). Vercel agrega solo la variable `BLOB_READ_WRITE_TOKEN` al proyecto. Ese mismo token (en el store, pestaña *.env.local*) va también en `worker/youtube/.env`, para que el servicio pueda anotar la dirección.
2. **Cargar en Vercel** `YOUTUBE_WORKER_SECRET`: la clave que está en `worker/youtube/.env` (se crea la primera vez que se abre el servicio). Después, *Redeploy*.
3. **Arrancar el servicio**: doble click en `worker/youtube/iniciar.cmd`. Al ratito muestra "Dirección anotada en Vercel: la app ya la usa". Para que arranque con Windows, poné un acceso directo a `iniciar.cmd` en la carpeta de inicio (`Win+R` → `shell:startup`).

En local, `.env.local` tiene `YOUTUBE_WORKER_URL=http://localhost:8787`: una dirección fija manda sobre la anotada (sirve también si el servicio pasa a un servidor con dirección propia). Los túneles sin cuenta de Cloudflare no tienen garantía de funcionamiento y Cloudflare pide no usarlos para mover mucho video: para lo que baja el estudio alcanza, pero si el uso crece, lo prolijo es el servidor de la empresa o un túnel con cuenta y dominio.

### Drive: activarlo (una sola vez)

En el proyecto de Google Cloud del cliente OAuth que ya usa Planificación (`GOOGLE_OAUTH_CLIENT_ID`):

1. **APIs y servicios → Biblioteca**: habilitar *Google Drive API* y *Google Picker API*.
2. **Credenciales → Crear credenciales → Clave de API**: restringirla a *Google Picker API* y, en "Restricciones de aplicaciones", a sitios web: el dominio de producción, el de testing/preview y `http://localhost:3000`. Va en `GOOGLE_PICKER_API_KEY`.
3. **Credenciales → el cliente OAuth → Orígenes autorizados de JavaScript**: agregar los mismos dominios (producción, preview y `http://localhost:3000`).
4. **Pantalla de consentimiento → Acceso a los datos**: agregar el permiso `.../auth/drive.file` (no es sensible: no hace falta verificar la app).
5. Cargar `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_PICKER_API_KEY` en Vercel (y en `.env.local`). Sin ellas, las opciones de Drive aparecen deshabilitadas.

---

## Stack

Next.js 14 (App Router) · React · TypeScript · Tailwind + Radix · Tiptap · Supabase (Tarjetas, login con Google, visitas) · gifenc + JSZip (GIF) · OpenAI embeddings (Emojis, opcional)
