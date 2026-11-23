-- ============================================================================
-- 05 · NETTOYAGE (facultatif) — UNIQUEMENT pour le projet « DecoshopGestion »
--
-- La toute première installation avait créé trois tables sans préfixe
-- (articles, orders, gestion_meta). Elles sont remplacées par les tables « deco_… »
-- et ne servent plus. Ce script les supprime, seulement si elles sont vides.
--
-- À lancer APRÈS 00_installation_complete.sql.
-- NE PAS exécuter dans un projet qui contient une autre application.
-- ============================================================================
do $$
begin
  if to_regclass('public.articles') is not null and to_regclass('public.orders') is not null then
    if exists (select 1 from public.articles) or exists (select 1 from public.orders) then
      raise exception 'Les anciennes tables contiennent des données : rien n''a été supprimé.';
    end if;
  end if;
  drop table if exists public.articles;
  drop table if exists public.orders;
  drop table if exists public.gestion_meta;
end;
$$;
