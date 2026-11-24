-- ============================================================================
-- INSTALLATION COMPLÈTE (01 + 02 + 03 réunis)
-- Supabase > SQL Editor > New query : coller TOUT ce fichier, puis Run.
-- Peut être relancé sans risque : rien n est effacé. À relancer après chaque mise à jour.
-- Ne crée que des tables préfixées « deco_ » : aucune autre table du projet n est modifiée.
-- ============================================================================

-- ============================================================================
-- 01 · TABLES
-- À exécuter en premier dans Supabase : SQL Editor > New query > coller > Run.
-- Peut être relancé sans risque (rien n'est effacé).
--
-- Toutes les tables portent le préfixe « deco_ » : elles ne touchent à aucune autre
-- table déjà présente dans le projet Supabase (orders, invoices, customers…).
-- ============================================================================

-- Articles du catalogue et leur stock disponible.
create table if not exists public.deco_articles (
  id          text primary key,
  name        text           not null,
  reference   text           not null default '',
  price       numeric(10, 2) not null check (price >= 0),   -- prix de vente TTC
  stock       integer        not null default 0 check (stock >= 0), -- quantité disponible (non réservée)
  created_at  timestamptz    not null default now()
);

-- Commandes / bons de commande.
create table if not exists public.deco_orders (
  id              text primary key,
  number          text        not null unique,              -- ex. BL-2026-0001
  created_at      timestamptz not null default now(),
  customer        jsonb       not null,                      -- { name, phone, address, postalCode, city, notes }
  lines           jsonb       not null,                      -- [ { id, articleId, name, reference, unitPrice, quantity, reserved } ]
  discount        jsonb       not null,                      -- { type: "percent" | "amount", value }
  delivery        jsonb       not null,                      -- { mode, basePrice, adjustment, offered }
  scheduled_date  date,                                      -- null = à programmer
  slot            text        not null default '' check (slot in ('', 'matin', 'apres-midi')),
  prepared        boolean     not null default false,
  prepared_at     timestamptz,
  reminded        boolean     not null default false,
  status          text        not null default 'active' check (status in ('active', 'done', 'cancelled')),
  done_at         timestamptz,
  geo             jsonb,                                     -- { lat, lon } pour la carte du livreur
  history         jsonb       not null default '[]'::jsonb   -- [ { at, text } ]
);

-- Champs ajoutés après la première version :
-- { shop, observations, paid, time, payments, extras, emails, geoFailed }.
alter table public.deco_orders add column if not exists extra jsonb not null default '{}'::jsonb;

create index if not exists deco_orders_scheduled_date_idx on public.deco_orders (scheduled_date);
create index if not exists deco_orders_status_idx         on public.deco_orders (status);

-- Une seule ligne : compteurs de numérotation, dépôt, et numéro de version
-- (la version empêche deux enregistrements simultanés de s'écraser).
create table if not exists public.deco_gestion_meta (
  id        boolean primary key default true check (id),
  version   bigint  not null default 0,
  counters  jsonb   not null default '{}'::jsonb,
  depot     jsonb
);

insert into public.deco_gestion_meta (id) values (true) on conflict (id) do nothing;

-- ───────────────────────── Paramètres de l'application ─────────────────────────
-- Clé « settings » : informations de la société et réglages des factures.
-- Clé « logo »     : image du logo ({ format, data en base64 }).
-- Clé « gestion_test » : jeu de commandes fictives du mode test ({ version, db }).
create table if not exists public.deco_settings (
  key         text primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- ───────────────────────── Gestion Lenbox ─────────────────────────
-- Fichiers d'export Lenbox importés (CSV ou Excel).
create table if not exists public.deco_lenbox_files (
  name         text primary key,
  size         integer     not null default 0,
  rows         integer     not null default 0,     -- lignes lues dans le fichier
  duplicates   integer     not null default 0,     -- lignes ignorées car déjà importées
  uploaded_at  timestamptz not null default now()
);

-- Une ligne par transaction Lenbox. Les montants sont ceux du fichier, non convertis
-- (en centimes dans les exports Lenbox : 150000 = 1 500,00 €).
create table if not exists public.deco_lenbox_transactions (
  key          text primary key,                   -- anti-doublon : ref|date|montant|retenue
  id           text    not null,                   -- identifiant de la facture (réf. dossier)
  kind         text    not null check (kind in ('sale', 'retention')),
  ref          text    not null,
  date         date    not null,
  client       text    not null,
  amount       numeric not null default 0,         -- original_amount
  transferred  numeric not null default 0,         -- transferred_amount
  commission   numeric not null default 0,         -- commission_retained
  retained     numeric not null default 0,         -- additional_amount_retained
  file         text    not null references public.deco_lenbox_files (name) on delete cascade,
  number       text                                -- numéro de facture (vide pour une retenue)
);

create index if not exists deco_lenbox_transactions_file_idx on public.deco_lenbox_transactions (file);
create index if not exists deco_lenbox_transactions_date_idx on public.deco_lenbox_transactions (date);

-- Une seule ligne : version, compteurs de numérotation par mois, registre des numéros
-- déjà attribués (un numéro de facture ne change jamais), fichiers retirés à ne pas réimporter.
create table if not exists public.deco_lenbox_meta (
  id        boolean primary key default true check (id),
  version   bigint  not null default 0,
  counters  jsonb   not null default '{}'::jsonb,
  numbers   jsonb   not null default '{}'::jsonb,
  ignored   jsonb   not null default '[]'::jsonb
);

-- Désignation saisie à la main pour une facture (le meuble vendu) : identifiant de facture → texte.
alter table public.deco_lenbox_meta add column if not exists designations jsonb not null default '{}'::jsonb;

insert into public.deco_lenbox_meta (id) values (true) on conflict (id) do nothing;


-- ============================================================================
-- 02 · FONCTIONS
-- À exécuter après 01_tables.sql. Peut être relancé sans risque.
-- L'application lit et écrit par ces fonctions (commandes : gestion_* ; Lenbox : lenbox_*),
-- et directement dans la table deco_settings pour les paramètres.
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


-- ============================================================================
-- 03 · SÉCURITÉ
-- À exécuter après 02_fonctions.sql. Peut être relancé sans risque.
--
-- Les données clients ne doivent pas être lisibles avec la clé publique
-- (sb_publishable_…), qui est visible par n'importe qui. On verrouille donc tout :
-- seul le serveur de l'application, avec la clé secrète, peut lire et écrire.
-- ============================================================================

-- Row Level Security activée, sans aucune règle d'accès : la clé publique ne voit rien.
alter table public.deco_articles     enable row level security;
alter table public.deco_orders       enable row level security;
alter table public.deco_gestion_meta enable row level security;
alter table public.deco_settings        enable row level security;
alter table public.deco_lenbox_files        enable row level security;
alter table public.deco_lenbox_transactions enable row level security;
alter table public.deco_lenbox_meta         enable row level security;

revoke all on public.deco_articles, public.deco_orders, public.deco_gestion_meta,
              public.deco_settings, public.deco_lenbox_files, public.deco_lenbox_transactions, public.deco_lenbox_meta
  from anon, authenticated;

-- Les fonctions ne sont appelables que par le serveur (clé secrète).
revoke all on function public.gestion_load() from public, anon, authenticated;
revoke all on function public.gestion_save(bigint, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gestion_load() to service_role;
grant execute on function public.gestion_save(bigint, jsonb, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.lenbox_load() from public, anon, authenticated;
revoke all on function public.lenbox_version() from public, anon, authenticated;
revoke all on function public.lenbox_save(bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.lenbox_load() to service_role;
grant execute on function public.lenbox_version() to service_role;
grant execute on function public.lenbox_save(bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

-- Le serveur (clé secrète) garde tous les droits sur les tables.
grant select, insert, update, delete
   on public.deco_articles, public.deco_orders, public.deco_gestion_meta,
      public.deco_settings, public.deco_lenbox_files, public.deco_lenbox_transactions, public.deco_lenbox_meta
   to service_role;


-- Vérification : doit afficher une ligne avec les deux numéros de version
select (select version from public.deco_gestion_meta) as version_commandes,
       (select version from public.deco_lenbox_meta)  as version_lenbox;
