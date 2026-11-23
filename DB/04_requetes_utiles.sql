-- ============================================================================
-- 04 · REQUÊTES UTILES (consultation uniquement, à lancer à la demande)
-- ============================================================================

-- État du stock : disponible, réservé pour des commandes, attendu par des clients.
select a.name                                                          as article,
       a.reference,
       a.price                                                         as prix_ttc,
       a.stock                                                         as disponible,
       coalesce(sum((l->>'quantity')::int) filter (where (l->>'reserved')::boolean), 0)     as reserve,
       coalesce(sum((l->>'quantity')::int) filter (where not (l->>'reserved')::boolean), 0) as en_attente
  from public.deco_articles a
  left join public.deco_orders o on o.status = 'active'
  left join lateral jsonb_array_elements(o.lines) l on l->>'articleId' = a.id
 group by a.id
 order by en_attente desc, a.name;

-- Livraisons et retraits programmés à partir d'aujourd'hui.
select o.scheduled_date as date, o.slot as creneau, o.number, o.customer->>'name' as client,
       o.delivery->>'mode' as formule, o.customer->>'city' as ville, o.prepared as preparee
  from public.deco_orders o
 where o.status = 'active' and o.scheduled_date >= current_date
 order by o.scheduled_date, o.slot;

-- Commandes en cours sans date (à programmer ou en attente de stock).
select o.number, o.customer->>'name' as client, o.created_at::date as creee_le,
       not exists (select 1 from jsonb_array_elements(o.lines) l where not (l->>'reserved')::boolean) as stock_complet
  from public.deco_orders o
 where o.status = 'active' and o.scheduled_date is null
 order by o.created_at;

-- Nombre de commandes par mois et par statut.
select to_char(o.created_at, 'YYYY-MM') as mois, o.status, count(*) as commandes
  from public.deco_orders o
 group by 1, 2
 order by 1 desc, 2;

-- Ventes : total, encaissé et reste à encaisser par mois (commandes non annulées).
-- Le total se calcule dans l'application, ici on suit les montants réglés.
select to_char(o.created_at, 'YYYY-MM') as mois, count(*) as commandes,
       sum(coalesce((o.extra->>'paid')::numeric, 0)) as encaisse
  from public.deco_orders o
 where o.status <> 'cancelled'
 group by 1
 order by 1 desc;

-- Lenbox : chiffre d'affaires, commissions et net par mois (montants des fichiers en centimes).
select to_char(t.date, 'YYYY-MM') as mois,
       count(*) filter (where t.kind = 'sale')                                    as factures,
       round(sum(t.amount) filter (where t.kind = 'sale') / 100, 2)               as chiffre_affaires,
       round(sum(t.commission) / 100, 2)                                          as commissions,
       round(sum(t.retained) / 100, 2)                                            as retenues,
       round(sum(t.transferred - t.commission - t.retained) / 100, 2)             as net_encaisse
  from public.deco_lenbox_transactions t
 group by 1
 order by 1;

-- Lenbox : retrouver les factures d'un client.
-- select number, date, client, amount / 100 as montant from public.deco_lenbox_transactions where client ilike '%nom%' order by date;

-- Sauvegarde complète en un seul JSON (à copier dans un fichier).
-- select public.gestion_load();
