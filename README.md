# Tarjetas

Guarda textos con su formato y su tipografía, y los copia listos para pegar.

- Tarjetas con texto enriquecido (negrita, cursiva, subrayado, listas, tamaño)
- **Cada fragmento guarda su tipografía exacta**, incluido el peso: "Montserrat Light" y "Montserrat Bold" conviven en el mismo párrafo
- Subida de archivos de fuente (`.woff2`, `.woff`, `.ttf`, `.otf`) con detección automática de familia y peso
- Clasificación por **marca** (pestañas) y **categoría** (filtros)
- Búsqueda por texto
- Copiar con formato · Copiar sin formato · Descargar `.rtf`

---

## Puesta en marcha (15 minutos)

### 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**. Guardá la contraseña que te pide.
2. Cuando termine de crearse, andá a **SQL Editor** → **New query**.
3. Abrí el archivo `supabase/schema.sql` de este repo, copiá todo el contenido, pegalo y apretá **Run**.

Eso crea las tablas, los permisos y el bucket `fonts` para los archivos de tipografía. Ya quedan cargadas tres categorías de ejemplo (Autonomía, Seguridad, Tecnología) y una marca "General".

### 2. Copiar las credenciales

En Supabase: **Project Settings** → **API**. Vas a necesitar dos valores:

- **Project URL**
- **anon public** key

### 3. Probar en tu computadora (opcional)

```bash
npm install
cp .env.local.example .env.local   # y pegá los dos valores del paso 2
npm run dev
```

Abrí http://localhost:3000

### 4. Publicar en Vercel

1. Subí esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New** → **Project** → elegí el repo.
3. En **Environment Variables** agregá:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**.

Listo: la URL que te da Vercel funciona desde cualquier dispositivo, sin instalar nada.

---

## Cómo pegar en Illustrator conservando la tipografía

Esto es lo más delicado del proyecto, así que conviene ser preciso.

**La condición que no se puede saltear:** Illustrator usa las fuentes instaladas en la computadora, no las del navegador. Si en la tarjeta hay "Montserrat Light", esa fuente tiene que estar instalada en la máquina donde pegás. La app le dice a Illustrator *qué* fuente usar; no le puede prestar el archivo.

Con eso resuelto, hay dos caminos:

### Copiar (el botón principal)

Pone el texto en el portapapeles con formato HTML: nombre de fuente, peso, tamaño y estilo por fragmento. Funciona muy bien en Word, Google Docs, InDesign y Figma. En Illustrator depende de la versión y del sistema operativo: a veces respeta todo, a veces pega texto plano.

### Descargar .rtf (el camino confiable)

En el menú `···` de la tarjeta. Descarga un archivo `.rtf` donde cada fuente figura por su nombre completo en la tabla de fuentes del documento.

En Illustrator: **Archivo → Colocar**, elegí el `.rtf`, y en el cuadro de opciones **destildá "Eliminar formato de texto"**. Ahí entra respetando cada peso, incluidos varios pesos distintos dentro del mismo párrafo.

Si vas a hacer esto seguido, empezá probando el botón Copiar. Si Illustrator te pega Arial, pasá al `.rtf` y no vuelvas a pelear con el portapapeles.

---

## Cómo se cargan las tipografías

**Ajustes** (engranaje) → pestaña **Tipografías** → seleccioná todos los archivos de la familia de una vez.

La app lee el nombre del archivo y completa familia, estilo y peso sola. `Montserrat-Light.woff2` se convierte en familia "Montserrat", estilo "Light", peso 300. Podés corregir cualquier campo antes de guardar.

Cada archivo se registra con su **nombre completo** ("Montserrat Light") como si fuera una fuente independiente. Es a propósito: así el navegador nunca inventa una negrita falsa, y el nombre que se guarda es el mismo que Illustrator e InDesign usan para identificar la fuente instalada.

Un detalle útil: si el texto está en Montserrat Light y apretás **negrita**, la app no engorda la Light — cambia al archivo Montserrat Bold si lo subiste. Es la diferencia entre una negrita real y una simulada, y es lo que hace que el pegado sea fiel.

---

## Sobre el acceso

Tal como está, cualquiera con el link puede ver y editar. Es la opción más simple para un equipo chico y evita explicarle contraseñas a gente que no quiere lidiar con eso.

Si más adelante necesitás restringirlo, el cambio está acotado: en `supabase/schema.sql` reemplazá las políticas `acceso abierto` por políticas basadas en `auth.uid()` y agregá el login de Supabase.

---

## Stack

Next.js 14 (App Router) · React · TypeScript · Tailwind + shadcn/ui · Tiptap · Supabase (Postgres + Storage)

Sin Prisma: el cliente de Supabase ya resuelve las consultas y una capa extra de ORM solo agregaría un paso de migraciones en cada deploy.
