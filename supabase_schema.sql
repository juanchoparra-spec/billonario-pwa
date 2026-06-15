-- Create trades table
create table if not exists trades (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  status text not null,
  fecha_entrada date,
  fecha_salida date,
  data jsonb,
  cost numeric,
  close_value numeric,
  pnl numeric,
  pct numeric,
  created_at timestamp default now()
);

-- Create movements table
create table if not exists movements (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  tipo text,
  monto numeric,
  fecha date,
  created_at timestamp default now()
);

-- Habilita Row Level Security
alter table trades enable row level security;
alter table movements enable row level security;

-- Politica simple: acceso total (esta app es de uso personal, sin login).
-- Si en el futuro agregas autenticación, reemplaza estas políticas por reglas basadas en auth.uid().
create policy "Allow all on trades" on trades
for all using (true) with check (true);

create policy "Allow all on movements" on movements
for all using (true) with check (true);
