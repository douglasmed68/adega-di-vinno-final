
-- ADEGA DI VINNO 2 - SCRIPT COMPLETO (owner-based)
-- CLIENTES
drop table if exists clientes cascade;
create table clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  endereco text,
  criado_em timestamp default now()
);

-- FORNECEDORES
drop table if exists fornecedores cascade;
create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  cnpj text,
  endereco text,
  criado_em timestamp default now()
);

-- VINHOS
drop table if exists vinhos cascade;
create table vinhos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  tipo text,
  safra text,
  pais_origem text,
  fornecedor_id uuid references fornecedores(id) on delete set null,
  codigo_barras text unique,
  custo numeric(10,2),
  preco_venda numeric(10,2),
  estoque integer default 0,
  criado_em timestamp default now()
);

-- VENDAS
drop table if exists vendas cascade;
create table vendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  data_venda timestamp default now(),
  total numeric(10,2) default 0
);

-- ITENS DE VENDA
drop table if exists itens_venda cascade;
create table itens_venda (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  venda_id uuid references vendas(id) on delete cascade,
  vinho_id uuid references vinhos(id) on delete cascade,
  quantidade integer not null,
  preco_unitario numeric(10,2) not null,
  subtotal numeric(10,2) generated always as (quantidade * preco_unitario) stored
);

-- COMPRAS
drop table if exists compras cascade;
create table compras (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  fornecedor_id uuid references fornecedores(id) on delete set null,
  data_compra timestamp default now(),
  total numeric(10,2) default 0
);

-- ITENS DE COMPRA
drop table if exists itens_compra cascade;
create table itens_compra (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  compra_id uuid references compras(id) on delete cascade,
  vinho_id uuid references vinhos(id) on delete cascade,
  quantidade integer not null,
  preco_custo numeric(10,2) not null,
  subtotal numeric(10,2) generated always as (quantidade * preco_custo) stored
);

-- FINANCEIRO
drop table if exists financeiro cascade;
create table financeiro (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  tipo text check (tipo in ('entrada','saída')),
  descricao text,
  valor numeric(10,2),
  data timestamp default now()
);

-- FUNÇÕES E GATILHOS DE ESTOQUE
create or replace function atualizar_estoque_venda()
returns trigger as $$
begin
  update vinhos
  set estoque = estoque - new.quantidade
  where id = new.vinho_id;
  return new;
end;
$$ language plpgsql;

create or replace function atualizar_estoque_compra()
returns trigger as $$
begin
  update vinhos
  set estoque = estoque + new.quantidade
  where id = new.vinho_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_venda on itens_venda;
create trigger trg_venda after insert on itens_venda
for each row execute procedure atualizar_estoque_venda();

drop trigger if exists trg_compra on itens_compra;
create trigger trg_compra after insert on itens_compra
for each row execute procedure atualizar_estoque_compra();

-- RLS
alter table clientes enable row level security;
alter table fornecedores enable row level security;
alter table vinhos enable row level security;
alter table vendas enable row level security;
alter table itens_venda enable row level security;
alter table compras enable row level security;
alter table itens_compra enable row level security;
alter table financeiro enable row level security;

-- POLÍTICAS OWNER-BASED
drop policy if exists clientes_policy on clientes;
create policy clientes_policy on clientes for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists fornecedores_policy on fornecedores;
create policy fornecedores_policy on fornecedores for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists vinhos_policy on vinhos;
create policy vinhos_policy on vinhos for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists vendas_policy on vendas;
create policy vendas_policy on vendas for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists itens_venda_policy on itens_venda;
create policy itens_venda_policy on itens_venda for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists compras_policy on compras;
create policy compras_policy on compras for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists itens_compra_policy on itens_compra;
create policy itens_compra_policy on itens_compra for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists financeiro_policy on financeiro;
create policy financeiro_policy on financeiro for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- FIM
