-- Plataforma demostrativa GH · esquema de datos en Supabase (proyecto gh-plataforma-demo).
-- Una sola tabla: cada fila es un registro de una colección, con su contenido en JSON.
-- Riesgos y estándares son de solo lectura y viven en public/data/*.json; aquí solo va lo editable.
-- Ejecutar una vez en Supabase → SQL Editor. Líneas cortas a propósito: el editor corta las largas al pegar.

create table if not exists public.registros (
  coleccion  text not null
    check (coleccion in ('plan-acciones', 'evaluaciones')),
  id         text not null
    check (id ~ '^[a-z0-9-]{1,80}$'),
  data       jsonb not null
    check (octet_length(data::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (coleccion, id),
  -- El id de la fila coincide con data.id (evita duplicados)
  check (data->>'id' = id)
);

-- Demo pública sin inicio de sesión: cualquiera con el enlace lee y edita.
-- Nadie borra desde la web: las acciones cambian de estado y las evaluaciones se conservan.
alter table public.registros enable row level security;

drop policy if exists "lectura publica" on public.registros;
drop policy if exists "alta publica" on public.registros;
drop policy if exists "edicion publica" on public.registros;

create policy "lectura publica"
on public.registros for select to anon using (true);

create policy "alta publica"
on public.registros for insert to anon with check (true);

create policy "edicion publica"
on public.registros for update to anon
using (true) with check (true);

grant select, insert, update on public.registros to anon;
