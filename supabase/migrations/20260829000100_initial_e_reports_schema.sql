create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  full_name text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('admin'))
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  admission_no text not null,
  full_name text not null,
  class_id uuid references public.classes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, admission_no)
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  term text,
  academic_year integer,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint exams_status_check check (status in ('draft', 'published'))
);

create table if not exists public.exam_classes (
  exam_id uuid not null references public.exams(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key (exam_id, class_id)
);

create table if not exists public.exam_subjects (
  exam_id uuid not null references public.exams(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (exam_id, subject_id)
);

create table if not exists public.marks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  score numeric(5,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marks_score_check check (score >= 0 and score <= 100),
  unique (exam_id, student_id, subject_id)
);

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  template_json jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.my_tenant_id()
returns uuid language sql stable security definer set search_path = public
as $$ select tenant_id from public.profiles where id = auth.uid() $$;
revoke all on function public.my_tenant_id() from public;
grant execute on function public.my_tenant_id() to authenticated;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.exams enable row level security;
alter table public.exam_classes enable row level security;
alter table public.exam_subjects enable row level security;
alter table public.marks enable row level security;
alter table public.report_templates enable row level security;

create policy classes_tenant on public.classes for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy subjects_tenant on public.subjects for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy students_tenant on public.students for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy exams_tenant on public.exams for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy exam_classes_tenant on public.exam_classes for all using (exam_id in (select id from public.exams where tenant_id = public.my_tenant_id())) with check (exam_id in (select id from public.exams where tenant_id = public.my_tenant_id()));
create policy exam_subjects_tenant on public.exam_subjects for all using (exam_id in (select id from public.exams where tenant_id = public.my_tenant_id())) with check (exam_id in (select id from public.exams where tenant_id = public.my_tenant_id()));
create policy marks_tenant on public.marks for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy report_templates_tenant on public.report_templates for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
