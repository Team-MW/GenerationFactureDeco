-- ============================================================================
-- 02 · FONCTIONS
-- À exécuter après 01_tables.sql. Peut être relancé sans risque.
-- L'application n'utilise que ces deux fonctions pour lire et écrire.
-- ============================================================================

-- Lecture : renvoie tout l'état (articles, commandes, compteurs, dépôt, version).
create or replace function public.gestion_load()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'version',  m.version,
    'counters', m.counters,
    'depot',    m.depot,
    'articles', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at, a.id) from public.deco_articles a), '[]'::jsonb),
    'orders',   coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at, o.id) from public.deco_orders o),   '[]'::jsonb)
  )
  from public.deco_gestion_meta m;
$$;

-- Écriture : enregistre en une seule transaction les articles et commandes modifiés.
-- Renvoie false (et n'écrit rien) si quelqu'un d'autre a enregistré entre-temps :
-- l'application relit alors les données et recommence.
create or replace function public.gestion_save(
  p_version  bigint,
  p_articles jsonb,
  p_orders   jsonb,
  p_counters jsonb,
  p_depot    jsonb
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update public.deco_gestion_meta
     set version  = version + 1,
         counters = coalesce(p_counters, '{}'::jsonb),
         depot    = p_depot
   where version = p_version;

  if not found then
    return false;
  end if;

  insert into public.deco_articles (id, name, reference, price, stock, created_at)
  select x.id, x.name, coalesce(x.reference, ''), x.price, x.stock, coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p_articles, '[]'::jsonb))
         as x(id text, name text, reference text, price numeric, stock integer, created_at timestamptz)
  on conflict (id) do update
     set name      = excluded.name,
         reference = excluded.reference,
         price     = excluded.price,
         stock     = excluded.stock;

  insert into public.deco_orders (
    id, number, created_at, customer, lines, discount, delivery, scheduled_date, slot,
    prepared, prepared_at, reminded, status, done_at, geo, history, extra
  )
  select x.id, x.number, coalesce(x.created_at, now()), x.customer, x.lines, x.discount, x.delivery,
         x.scheduled_date, coalesce(x.slot, ''), coalesce(x.prepared, false), x.prepared_at,
         coalesce(x.reminded, false), coalesce(x.status, 'active'), x.done_at, x.geo,
         coalesce(x.history, '[]'::jsonb), coalesce(x.extra, '{}'::jsonb)
    from jsonb_to_recordset(coalesce(p_orders, '[]'::jsonb))
         as x(id text, number text, created_at timestamptz, customer jsonb, lines jsonb, discount jsonb,
              delivery jsonb, scheduled_date date, slot text, prepared boolean, prepared_at timestamptz,
              reminded boolean, status text, done_at timestamptz, geo jsonb, history jsonb, extra jsonb)
  on conflict (id) do update
     set customer       = excluded.customer,
         lines          = excluded.lines,
         discount       = excluded.discount,
         delivery       = excluded.delivery,
         scheduled_date = excluded.scheduled_date,
         slot           = excluded.slot,
         prepared       = excluded.prepared,
         prepared_at    = excluded.prepared_at,
         reminded       = excluded.reminded,
         status         = excluded.status,
         done_at        = excluded.done_at,
         geo            = excluded.geo,
         history        = excluded.history,
         extra          = excluded.extra;

  return true;
end;
$$;

-- ───────────────────────── Gestion Lenbox ─────────────────────────

-- Lecture : fichiers, transactions, compteurs, registre des numéros, version.
create or replace function public.lenbox_load()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'version',      m.version,
    'counters',     m.counters,
    'numbers',      m.numbers,
    'ignored',      m.ignored,
    'designations', m.designations,
    'files',        coalesce((select jsonb_agg(to_jsonb(f) order by f.name) from public.deco_lenbox_files f), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.ref) from public.deco_lenbox_transactions t), '[]'::jsonb)
  )
  from public.deco_lenbox_meta m;
$$;

-- Numéro de version seul : permet à l'interface de détecter un changement sans tout relire.
create or replace function public.lenbox_version()
returns bigint
language sql
stable
set search_path = public
as $$
  select version from public.deco_lenbox_meta;
$$;

-- (ancienne signature, remplacée par celle ci-dessous)
drop function if exists public.lenbox_save(bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb);

-- Écriture atomique d'un import, d'un retrait de fichier ou d'une désignation modifiée.
-- Renvoie false (et n'écrit rien) si un autre enregistrement est passé entre-temps.
create or replace function public.lenbox_save(
  p_version       bigint,
  p_files         jsonb,   -- fichiers ajoutés ou mis à jour
  p_transactions  jsonb,   -- nouvelles transactions
  p_removed       jsonb,   -- noms des fichiers retirés (leurs transactions partent avec)
  p_counters      jsonb,
  p_numbers       jsonb,
  p_ignored       jsonb,
  p_designations  jsonb
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update public.deco_lenbox_meta
     set version  = version + 1,
         counters = coalesce(p_counters, '{}'::jsonb),
         numbers  = coalesce(p_numbers,  '{}'::jsonb),
         ignored  = coalesce(p_ignored,  '[]'::jsonb),
         designations = coalesce(p_designations, '{}'::jsonb)
   where version = p_version;

  if not found then
    return false;
  end if;

  delete from public.deco_lenbox_files
   where name in (select jsonb_array_elements_text(coalesce(p_removed, '[]'::jsonb)));

  insert into public.deco_lenbox_files (name, size, rows, duplicates, uploaded_at)
  select x.name, coalesce(x.size, 0), coalesce(x.rows, 0), coalesce(x.duplicates, 0), coalesce(x.uploaded_at, now())
    from jsonb_to_recordset(coalesce(p_files, '[]'::jsonb))
         as x(name text, size integer, rows integer, duplicates integer, uploaded_at timestamptz)
  on conflict (name) do update
     set size = excluded.size, rows = excluded.rows, duplicates = excluded.duplicates;

  insert into public.deco_lenbox_transactions (key, id, kind, ref, date, client, amount, transferred, commission, retained, file, number)
  select x.key, x.id, x.kind, x.ref, x.date, x.client, coalesce(x.amount, 0), coalesce(x.transferred, 0),
         coalesce(x.commission, 0), coalesce(x.retained, 0), x.file, x.number
    from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb))
         as x(key text, id text, kind text, ref text, date date, client text, amount numeric, transferred numeric,
              commission numeric, retained numeric, file text, number text)
  on conflict (key) do nothing;

  return true;
end;
$$;
