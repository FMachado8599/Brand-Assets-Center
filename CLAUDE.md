# CLAUDE.md

## Supabase

- Hay dos proyectos: **BFG Testing** (`xsxbrhkorqudwnimkfho`), el de pruebas, y **Brand Assets Center** (`eqzcpacqlwvowugmeads`), el de producción.
- Cada migración (`supabase/migracion-*.sql`) se corre **primero en BFG Testing**, se verifica y recién después va a producción.
- Las migraciones se pueden correr más de una vez, pero algunas mueven datos. Antes de repetir una en producción, revisá qué datos toca.

### Cómo se nombran las queries

Las queries llevan **categoría y nombre**:

- **Feature**: lo que es de una feature puntual. Ej: `Feature | Notificaciones`, `Feature | Board equipo`.
- **Logic**: la lógica general, que no es de una feature. Ej: `Logic | Acceso`.
- Puede haber otras categorías. Si no está claro cuál corresponde, preguntar.

Dónde se usa:

- **Queries guardadas en el SQL Editor**: `Categoría | Nombre`, tal cual (ej: `Feature | Notificaciones`).
- **Historial de migraciones** (cuando una migración se corre con la herramienta de Supabase): la misma categoría y el mismo nombre, en minúsculas y con guion bajo, porque la herramienta no acepta otra cosa. Ej: `feature_notificaciones`, `feature_board_equipo`, `logic_acceso`.

## Al editar

- Algunos archivos usan finales de línea CRLF (ej: `README.md`, `components/shell/ContextBar.tsx`, `components/shell/AccountPill.tsx`). Hay que mantenerlos: no convertirlos a LF.
