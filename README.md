# Plataforma demostrativa GH Estudios

Primer módulo: **D1 · Debida diligencia y DDHH (Solgas)**. El plan de trabajo es interno y no está en el repositorio.

- `public/` se publica en GitHub Pages en cada push a `main`.
- `public/config.js`: URL y clave pública de Supabase (único cambio para migrar de cuenta).
- `public/api-supabase.js`: capa de datos (`window.GHDatos`); colecciones editables `plan-acciones` y `evaluaciones`.
- `public/data/`: datos semilla y respaldo. `public/config/`: criticidad y umbrales.
- `supabase/schema.sql`: se ejecuta una vez en el SQL Editor.
- `privado/`: credenciales y encargos, fuera del repositorio.
- Pruebas: `npm test`.

Repositorio independiente de Radar 360: no comparte código, base ni despliegue.
