alter table public.meals add column steps jsonb not null default '[]'::jsonb;
alter table public.meals add column label_detected boolean not null default false;
