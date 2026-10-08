# Herramientas

Un solo lugar para las herramientas del día a día del estudio:

| Módulo | Ruta | Qué hace |
| --- | --- | --- |
| **Tarjetas** | `/` | Textos con su formato y su tipografía, listos para pegar |
| **Emojis** | `/emojis` | Emojis de Apple en PNG: buscás en español o inglés y copiás con un click |
| **GIF** | `/gif` | Banners animados a partir de frames (lo que antes era Programática) |
| **Conversor** | `/conversor` | Convertir y comprimir archivos con FreeConvert |
| **Redacción** | `/redaccion` | Escribir textos con formato y con los emojis y hashtags de cada cliente a un click, y copiarlos al toque |

---

## Cómo se usa: sidebar + barra contextual

- **El botón amarillo de arriba a la izquierda** abre la sidebar flotante con los módulos. Ahí se navega; `Esc` la cierra.
- **La barra flotante del centro** cambia según el módulo: es desde donde se hace todo (buscar, filtrar, agregar, exportar, configurar). Al pasar de un módulo a otro se transforma en lugar de recargarse.
- Los botones son íconos; si dejás el mouse un segundo encima aparece su nombre.
- `/` enfoca el buscador del módulo, en cualquier momento.
- **El avatar de arriba a la derecha** es la cuenta: iniciar sesión con Google o cerrarla (ver "Cuentas y visitas").

El fondo y las superficies flotantes viven en `app/globals.css` (clase `.floating`). La barra está en `components/shell/ContextBar.tsx`: cada página monta `<ContextBar>` con sus controles y estos se "teletransportan" a la barra del layout.

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

Las que no empiezan con `NEXT_PUBLIC_` viven solo en el servidor. En Vercel se cargan en **Settings → Environment Variables**.

---

## Cuentas y visitas

Iniciar sesión es opcional: sin cuenta se usa todo igual y lo personal queda guardado solo en ese navegador. Con cuenta (Google), se guarda también en Supabase y aparece en cualquier computadora:

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
   - En **Audience**, publicala (*In production*) o agregá los mails del equipo como *Test users*: en modo *Testing*, Google solo deja entrar a esos.
3. **Supabase → Authentication → Sign In / Providers → Google**: activalo y pegá el *Client ID* y el *Client Secret* de Google.
4. **Supabase → Authentication → URL Configuration**:
   - *Site URL*: la URL de producción.
   - *Redirect URLs*: `http://localhost:3000/**` y `https://<tu-dominio>/**`. Para los previews de Vercel, también `https://*-<tu-equipo>.vercel.app/**`.
   - Van con `/**` porque la vuelta del login lleva `?next=…` (la página desde la que entraste): con la URL exacta, Supabase puede rechazarla y mandarte a la *Site URL*.

Si Google no está activado, el botón "Continuar con Google" avisa qué falta en lugar de mandar a una página de error.

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
- **Cliente**: cada redacción puede tener uno. Los clientes son las marcas de Tarjetas (la misma lista; se agregan en Tarjetas → Ajustes). Una nueva sigue con el cliente de la anterior.
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

## Tarjetas

Guarda textos con su formato y su tipografía, y los copia listos para pegar.

- Tarjetas con texto enriquecido (negrita, cursiva, subrayado, listas, tamaño)
- Cambio de caja: MAYÚSCULAS, minúsculas y Capitalizar Cada Palabra — reescribe las letras de verdad, así viajan bien al portapapeles
- **Cada fragmento guarda su tipografía exacta**, incluido el peso: "Montserrat Light" y "Montserrat Bold" conviven en el mismo párrafo
- Subida de archivos de fuente (`.woff2`, `.woff`, `.ttf`, `.otf`) con detección automática de familia y peso
- Clasificación por **marca**, **producto** (el modelo dentro de la marca) y **categoría**, con filtros de selección múltiple (en la barra, ícono de filtros)
- Las tarjetas se agrupan solas: la marca es una columna y cada producto abre su propia fila
- Copiar con formato · Copiar sin formato · Descargar `.rtf` / `.svg`

### Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. **SQL Editor** → **New query** → pegá el contenido de `supabase/schema.sql` → **Run**.
3. **Project Settings → API**: copiá **Project URL** y la key **anon public** a `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

> Si ya habías corrido una versión anterior de `schema.sql`, corré `supabase/migracion-productos.sql`: agrega la tabla de productos, la columna `product_id` en las tarjetas y la columna que marca las fuentes variables.

Eso crea las tablas, los permisos y el bucket `fonts` para los archivos de tipografía.

### Marcas, productos y categorías

Son tres clasificaciones independientes que se cruzan:

- **Marca** — Changan, por ejemplo.
- **Producto** — el modelo dentro de esa marca: Lumin, Hunter, Eado, CS55, Q05. Un producto siempre pertenece a una marca, así que el selector de producto solo te ofrece los modelos de la marca elegida, tanto al crear una tarjeta como al filtrar.
- **Categoría** — transversal a todas las marcas: Autonomía, Seguridad, Tecnología.

Las tarjetas se ordenan solas en dos niveles. La marca es una columna, y adentro cada producto abre un divisor con su nombre a la izquierda y sus tarjetas en fila. El encabezado de marca aparece solo cuando hay más de una a la vista. Las tarjetas sin producto quedan al final bajo "Sin producto".

Borrar una marca borra también sus productos; las tarjetas sobreviven, quedan sin marca.

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

Tal como está, cualquiera con el link puede ver y editar, con o sin sesión. El login ya existe (ver "Cuentas y visitas"): si más adelante querés que solo editen quienes iniciaron sesión, o tarjetas privadas, en `supabase/schema.sql` reemplazá las políticas `acceso abierto` por políticas basadas en `auth.uid()` y `owner_id`.

---

## Conversor

Conversor y compresor de archivos con la API de [FreeConvert](https://www.freeconvert.com/api/v1/).

- **Convertir / Comprimir** se elige en la barra. Los formatos posibles se leen en vivo de FreeConvert para cada archivo.
- **Opciones avanzadas** (ícono de ajustes en cada archivo): el formulario se arma con el esquema que publica FreeConvert para ese par de formatos. Las etiquetas vienen de la API, en inglés.
- **Configuración** (en la barra): archivos en paralelo y formato preferido por tipo (imágenes, videos, audio, documentos).

Necesita `FREECONVERT_API_KEY` (sacala en [freeconvert.com/api](https://www.freeconvert.com/api)). La key vive solo en el servidor (`app/api/freeconvert/*`): el navegador recibe un formulario de subida firmado y manda el archivo directo a FreeConvert, así que los archivos grandes no pasan por Vercel. Cada conversión consume minutos de tu plan.

---

## Stack

Next.js 14 (App Router) · React · TypeScript · Tailwind + Radix · Tiptap · Supabase (Tarjetas, login con Google, visitas) · gifenc + JSZip (GIF) · OpenAI embeddings (Emojis, opcional)
