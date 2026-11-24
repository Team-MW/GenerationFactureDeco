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
