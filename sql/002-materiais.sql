-- Migração aplicada em 2026-06-09 (criar_tabela_materiais)
-- Materiais vendidos por área (m²): vidro, chapa (fundo) e espelho.
-- Moldura continua na tabela molduras (vendida por metro linear/perímetro).
create table public.materiais (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  tipo text not null check (tipo in ('vidro', 'chapa', 'espelho')),
  nome text not null,
  espessura_mm numeric,
  preco_m2 numeric not null,
  preco_minimo numeric,
  descricao text,
  disponivel boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.materiais enable row level security;

create index materiais_tipo_idx on public.materiais (tipo) where disponivel;
