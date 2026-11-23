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
