-- =====================================================================
-- ARAM · Clínica de rehabilitación física
-- Esquema de base de datos para Supabase (PostgreSQL)
--
-- Cómo usarlo: en tu proyecto de Supabase abre "SQL Editor" → "New query",
-- pega TODO este archivo y presiona "Run". Se puede ejecutar más de una vez.
-- Al final, cambia el correo de la última línea por el tuyo.
-- =====================================================================

-- ---------- Personas autorizadas a usar la app ----------
create table if not exists public.miembros (
  email      text primary key,
  creado_en  timestamptz not null default now()
);

-- Devuelve true si el usuario que inició sesión está en la tabla miembros
create or replace function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miembros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.es_miembro() from public;
grant execute on function public.es_miembro() to authenticated;

-- ---------- Marca de última modificación ----------
create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------- Pacientes ----------
create table if not exists public.pacientes (
  id                   text primary key,
  nombre               text not null,
  apellidos            text not null,
  documento            text,
  nacimiento           date,
  sexo                 text,
  ocupacion            text,
  telefono             text,
  email                text,
  direccion            text,
  contacto_emergencia  text,
  tel_emergencia       text,
  aseguradora          text,
  diagnostico          text,
  medico_referente     text,
  sesiones_prescritas  integer,
  estado               text not null default 'activo',   -- activo | alta | pausa
  creado               date default current_date,        -- fecha de ingreso
  alergias             text,
  antecedentes         text,
  medicamentos         text,
  notas                text,
  ejemplo              boolean not null default false,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

-- ---------- Citas (también son las entradas por sesión) ----------
create table if not exists public.citas (
  id              text primary key,
  paciente_id     text not null references public.pacientes(id) on delete cascade,
  fecha           date not null,
  hora            text not null,                 -- formato HH:MM
  duracion        integer not null default 60,   -- minutos
  terapeuta       text,
  tipo            text,
  estado          text not null default 'programada', -- programada | confirmada | completada | cancelada | no_asistio
  monto           numeric(12,2) default 0,
  pago            text not null default 'pendiente',  -- pendiente | pagado
  metodo          text,
  notas           text,
  ejemplo         boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists citas_fecha_idx    on public.citas (fecha);
create index if not exists citas_paciente_idx on public.citas (paciente_id);

-- ---------- Historial clínico ----------
create table if not exists public.historial (
  id              text primary key,
  paciente_id     text not null references public.pacientes(id) on delete cascade,
  fecha           date not null,
  tipo            text,
  terapeuta       text,
  eva             integer check (eva between 0 and 10),
  motivo          text,
  hallazgos       text,
  tratamiento     text,
  plan            text,
  ejemplo         boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists historial_paciente_idx on public.historial (paciente_id);

-- ---------- Gastos (salidas) ----------
create table if not exists public.gastos (
  id              text primary key,
  fecha           date not null,
  concepto        text not null,
  categoria       text,
  monto           numeric(12,2) not null,
  metodo          text,
  proveedor       text,
  notas           text,
  ejemplo         boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists gastos_fecha_idx on public.gastos (fecha);

-- ---------- Otras entradas (venta de pomadas, material, etc.) ----------
create table if not exists public.ingresos (
  id              text primary key,
  fecha           date not null,
  concepto        text not null,
  categoria       text,
  cantidad        integer default 1,
  precio          numeric(12,2),
  monto           numeric(12,2) not null,
  metodo          text,
  paciente_id     text references public.pacientes(id) on delete set null,
  notas           text,
  ejemplo         boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists ingresos_fecha_idx on public.ingresos (fecha);

-- ---------- Ajustes de la clínica (una sola fila con id = 'clinica') ----------
create table if not exists public.config (
  id              text primary key,
  fisioterapeuta  text,
  precio_sesion   numeric(12,2),
  moneda          text default '$',
  actualizado_en  timestamptz not null default now()
);

-- ---------- Disparadores y seguridad (RLS) ----------
do $$
declare t text;
begin
  foreach t in array array['pacientes','citas','historial','gastos','ingresos','config'] loop
    execute format('drop trigger if exists %I_actualizado on public.%I', t, t);
    execute format('create trigger %I_actualizado before update on public.%I for each row execute function public.tocar_actualizado()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "solo miembros" on public.%I', t);
    execute format('create policy "solo miembros" on public.%I for all to authenticated using (public.es_miembro()) with check (public.es_miembro())', t);
  end loop;
end $$;

-- La tabla miembros solo se administra desde el panel de Supabase
alter table public.miembros enable row level security;

-- ---------- Tiempo real (sincroniza celular y computadora al instante) ----------
do $$
declare t text;
begin
  foreach t in array array['pacientes','citas','historial','gastos','ingresos','config'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- CAMBIA ESTE CORREO por el que usarás para entrar a la app.
-- Agrega una línea por cada persona que deba tener acceso.
-- =====================================================================
insert into public.miembros (email) values ('aguileramtz_alam@outlook.com')
  on conflict (email) do nothing;
  insert into public.miembros (email) values ('alexia77755@gmail.com')
  on conflict (email) do nothing;
