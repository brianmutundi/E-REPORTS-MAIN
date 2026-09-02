create table if not exists public.report_staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  role text not null default 'teacher',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint report_staff_role_check
    check (role in ('teacher', 'principal'))
);

create index if not exists report_staff_tenant_idx
  on public.report_staff(tenant_id);

create index if not exists report_staff_role_idx
  on public.report_staff(tenant_id, role);

alter table public.report_staff enable row level security;

drop policy if exists report_staff_tenant on public.report_staff;

create policy report_staff_tenant
on public.report_staff
for all
using (tenant_id = public.my_tenant_id())
with check (tenant_id = public.my_tenant_id());


create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create index if not exists streams_tenant_idx
  on public.streams(tenant_id);

create index if not exists streams_class_idx
  on public.streams(class_id);

alter table public.streams enable row level security;

drop policy if exists streams_tenant on public.streams;

create policy streams_tenant
on public.streams
for all
using (tenant_id = public.my_tenant_id())
with check (tenant_id = public.my_tenant_id());


create table if not exists public.class_stream_teachers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stream_id uuid not null references public.streams(id) on delete cascade,
  staff_id uuid not null references public.report_staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (stream_id)
);

create index if not exists class_stream_teachers_tenant_idx
  on public.class_stream_teachers(tenant_id);

create index if not exists class_stream_teachers_stream_idx
  on public.class_stream_teachers(stream_id);

alter table public.class_stream_teachers enable row level security;

drop policy if exists class_stream_teachers_tenant
  on public.class_stream_teachers;

create policy class_stream_teachers_tenant
on public.class_stream_teachers
for all
using (tenant_id = public.my_tenant_id())
with check (tenant_id = public.my_tenant_id());


create table if not exists public.school_report_principals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.report_staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table public.school_report_principals enable row level security;

drop policy if exists school_report_principals_tenant
  on public.school_report_principals;

create policy school_report_principals_tenant
on public.school_report_principals
for all
using (tenant_id = public.my_tenant_id())
with check (tenant_id = public.my_tenant_id());
