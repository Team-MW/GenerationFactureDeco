-- ============================================================================
-- 06 · INVENTAIRE
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller tout > Run.
-- Peut être relancé sans risque : rien n'est effacé, aucun produit n'est créé en double.
--
-- 1. Ajoute la catégorie, les dimensions et le coloris aux articles (table deco_articles,
--    celle que les bons de commande utilisent déjà).
-- 2. Met à jour la fonction d'enregistrement pour qu'elle écrive ces trois champs.
-- 3. Importe les 113 produits du fichier Decoshop_Produits_Import.csv.
--    Chaque ligne du fichier est une pièce en magasin : stock de départ 1 (à ajuster dans la page Stock).
--    Prix 0 = « prix à définir ».
-- ============================================================================

-- 1 · Nouvelles colonnes
alter table public.deco_articles add column if not exists category   text not null default '';
alter table public.deco_articles add column if not exists dimensions text not null default '';
alter table public.deco_articles add column if not exists color      text not null default '';

-- 2 · Fonction d'enregistrement
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

  insert into public.deco_articles (id, name, reference, category, dimensions, color, price, stock, created_at)
  select x.id, x.name, coalesce(x.reference, ''), coalesce(x.category, ''), coalesce(x.dimensions, ''), coalesce(x.color, ''),
         x.price, x.stock, coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p_articles, '[]'::jsonb))
         as x(id text, name text, reference text, category text, dimensions text, color text,
              price numeric, stock integer, created_at timestamptz)
  on conflict (id) do update
     set name       = excluded.name,
         reference  = excluded.reference,
         category   = excluded.category,
         dimensions = excluded.dimensions,
         color      = excluded.color,
         price      = excluded.price,
         stock      = excluded.stock;

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

-- 3 · Produits (ignorés s'ils existent déjà avec la même référence)
insert into public.deco_articles (id, name, reference, category, dimensions, color, price, stock)
select substr(md5(v.reference), 1, 12), v.name, v.reference, v.category, v.dimensions, v.color, v.price, 1
  from (values
    ('DS-BUFFETS-BUFFET-CALYPSO-180-NOYER-TRAVERTIN', 'Buffet Calypso', 'Buffets', '180', 'Noyer / travertin', 0),
    ('DS-CANAPES-BODRUM-BLANC', 'Bodrum', 'Canapés', '', 'Blanc', 0),
    ('DS-CANAPES-GRANDE-CREMONA-330-180-CM', 'Grande Cremona', 'Canapés', '330 × 180 cm', '', 1690),
    ('DS-CANAPES-GRANDE-IBIZA', 'Grande Ibiza', 'Canapés', '', '', 1690),
    ('DS-CANAPES-MARBELLA-300-200-CM', 'Marbella', 'Canapés', '300 × 200 cm', '', 1690),
    ('DS-CANAPES-MAYA', 'Maya', 'Canapés', '', '', 1990),
    ('DS-CANAPES-MODULO', 'Modulo', 'Canapés', '', '', 1190),
    ('DS-CANAPES-MONZA-300-200-CM', 'Monza', 'Canapés', '300 × 200 cm', '', 2390),
    ('DS-CANAPES-ODESSA-ANGLE-330-170-CM', 'Odessa Angle', 'Canapés', '330 × 170 cm', '', 1890),
    ('DS-CANAPES-POLA-CREMONA', 'Pola Cremona', 'Canapés', '', '', 1690),
    ('DS-CANAPES-STELLA', 'Stella', 'Canapés', '', '', 1490),
    ('DS-CANAPES-TEDDY-230-70-CM', 'Teddy', 'Canapés', '230 × 70 cm', '', 1490),
    ('DS-CANAPES-WEST-230-200-CM', 'West', 'Canapés', '230 × 200 cm', '', 1390),
    ('DS-CANAPES-DANGLE-ALYA-ANGLE-DROIT', 'Alya', 'Canapés d’angle', 'Angle droit', '', 0),
    ('DS-CANAPES-DANGLE-CANYON-ANGLE-CREMONA-06', 'Canyon', 'Canapés d’angle', 'Angle', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-MARBELLA-ANGLE-DROIT-02', 'Marbella', 'Canapés d’angle', 'Angle droit', '02', 0),
    ('DS-CANAPES-DANGLE-MARBELLA-ANGLE-GAUCHE-02', 'Marbella', 'Canapés d’angle', 'Angle gauche', '02', 0),
    ('DS-CANAPES-DANGLE-ODESSA-ANGLE-CREMONA-06', 'Odessa', 'Canapés d’angle', 'Angle', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-ORION-ANGLE-CREMONA-06', 'Orion', 'Canapés d’angle', 'Angle', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-ORION-ANGLE-1-JOKERLI-SOFT-03', 'Orion angle', 'Canapés d’angle', '1 Jokerli', 'Soft 03', 0),
    ('DS-CANAPES-DANGLE-TEDDY-ANGLE-DROIT-02', 'Teddy', 'Canapés d’angle', 'Angle droit', '02', 0),
    ('DS-CANAPES-DANGLE-TEDDY-ANGLE-DROIT-CREMONA-06', 'Teddy', 'Canapés d’angle', 'Angle droit', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-TEDDY-ANGLE-GAUCHE-02', 'Teddy', 'Canapés d’angle', 'Angle gauche', '02', 0),
    ('DS-CANAPES-DANGLE-TEDDY-ANGLE-GAUCHE-CREMONA-06', 'Teddy', 'Canapés d’angle', 'Angle gauche', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-TEDDY-ANGLE-2-L-CREMONA-06', 'Teddy angle', 'Canapés d’angle', '2+L', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-TEDDY-ANGLE-INVERSE-L-2-CREMONA-06', 'Teddy angle inversé', 'Canapés d’angle', 'L+2', 'Cremona 06', 0),
    ('DS-CANAPES-DANGLE-TORRES-ANGLE-LORIS-NOYER-3-L-2-SOFT-03', 'Torres angle Loris noyer', 'Canapés d’angle', '3+L+2', 'Soft 03', 0),
    ('DS-CHAISES-ATLANTIS-50-50-82-CM', 'Atlantis', 'Chaises', '50 × 50 × 82 cm', '', 159),
    ('DS-CHAISES-BERTA', 'Berta', 'Chaises', '', '', 129),
    ('DS-CHAISES-BOHEME-CH-50-50-84-CM', 'Bohème CH', 'Chaises', '50 × 50 × 84 cm', '', 129),
    ('DS-CHAISES-CHAISE-ONIX-CREMONA-BEIGE', 'Chaise Onix', 'Chaises', '', 'Cremona beige', 0),
    ('DS-CHAISES-CHAISE-TEDDY', 'Chaise Teddy', 'Chaises', '', '', 119),
    ('DS-CHAISES-CHARLY-55-50-82-CM', 'Charly', 'Chaises', '55 × 50 × 82 cm', '', 139),
    ('DS-CHAISES-HALEY-50-50-82-CM', 'Haley', 'Chaises', '50 × 50 × 82 cm', '', 139),
    ('DS-CHAISES-HERA', 'Héra', 'Chaises', '', '', 139),
    ('DS-CHAISES-IRIS-56-47-80-CM', 'Iris', 'Chaises', '56 × 47 × 80 cm', '', 139),
    ('DS-CHAISES-ONIX-58-50-77-CM-TAUPE-CHENILLE', 'Onix', 'Chaises', '58 × 50 × 77 cm', 'Taupe chenille', 159),
    ('DS-CHAISES-T-CREME', 'T', 'Chaises', '', 'Crème', 159),
    ('DS-CHAISES-YSE-50-46-82-CM-NOYER-CHENILLE', 'Ysé', 'Chaises', '50 × 46 × 82 cm', 'Noyer / chenille', 139),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-BOSS-MATELAS-BOSS-160-200-ODESSA-680', 'Boss + matelas Boss', 'Ensembles lit et matelas', '160 × 200', 'Odessa 680', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-COSMOS-MATELAS-COSMOS-160-200-ERATO-03', 'Cosmos + matelas Cosmos', 'Ensembles lit et matelas', '160 × 200', 'Erato 03', 1490),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-DISNEY-MATELAS-RITIM-160-200-ODESSA-10', 'Disney + matelas Ritim', 'Ensembles lit et matelas', '160 × 200', 'Odessa 10', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-ERMES-MATELAS-PUFFY-160-200-ODESSA-20', 'Ermes + matelas Puffy', 'Ensembles lit et matelas', '160 × 200', 'Odessa 20', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-KAREM-MATELAS-COMFORT-90-190-ANGEL-01', 'Karem + matelas Comfort', 'Ensembles lit et matelas', '90 × 190', 'Angel 01', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-LAURA-MATELAS-LAURA-140-190-ALFA-015', 'Laura + matelas Laura', 'Ensembles lit et matelas', '140 × 190', 'Alfa 015', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-LAURA-MATELAS-LAURA-180-200-ALFA-010', 'Laura + matelas Laura', 'Ensembles lit et matelas', '180 × 200', 'Alfa 010', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-LAURA-MATELAS-LAURA-180-200-SOFT-02-BABYFACE', 'Laura + matelas Laura', 'Ensembles lit et matelas', '180 × 200', 'Soft 02 BabyFace', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-ORLANO-MATELAS-COMFORT-90-190-SOFT-04-BABYFACE', 'Orlano + matelas Comfort', 'Ensembles lit et matelas', '90 × 190', 'Soft 04 BabyFace', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-PACO-MATELAS-PACO-160-200-ERATO-03', 'Paco + matelas Paco', 'Ensembles lit et matelas', '160 × 200', 'Erato 03', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-PACO-MATELAS-PACO-90-190-ODESSA-680', 'Paco + matelas Paco', 'Ensembles lit et matelas', '90 × 190', 'Odessa 680', 0),
    ('DS-ENSEMBLES-LIT-ET-MATELAS-VEGA-MATELAS-VEGA-140-190-SOFT-02-BABYFACE', 'Vega + matelas Vega', 'Ensembles lit et matelas', '140 × 190', 'Soft 02 BabyFace', 0),
    ('DS-LITS-ALBA-90-190-SOFT-03', 'Alba', 'Lits', '90 × 190', 'Soft 03', 0),
    ('DS-LITS-ANNA-160-200-ODESSA-020', 'Anna', 'Lits', '160 × 200', 'Odessa 020', 0),
    ('DS-LITS-ATHENA-160-200-SOFT-02', 'Athena', 'Lits', '160 × 200', 'Soft 02', 0),
    ('DS-LITS-ATHENA-90-190-SOFT-02', 'Athena', 'Lits', '90 × 190', 'Soft 02', 0),
    ('DS-LITS-EPSON-140-190-SOFT-02', 'Epson', 'Lits', '140 × 190', 'Soft 02', 0),
    ('DS-LITS-EPSON-140-190-SOFT-09', 'Epson', 'Lits', '140 × 190', 'Soft 09', 0),
    ('DS-LITS-HYBRID-90-190-SOFT-02', 'Hybrid', 'Lits', '90 × 190', 'Soft 02', 0),
    ('DS-LITS-HYBRID-90-190-SOFT-09', 'Hybrid', 'Lits', '90 × 190', 'Soft 09', 0),
    ('DS-LITS-LIT-BOX-RIVOLI-140', 'Lit box Rivoli', 'Lits', '140', '', 0),
    ('DS-LITS-LIT-BOX-RIVOLI-90-190', 'Lit box Rivoli', 'Lits', '90 × 190', '', 0),
    ('DS-LITS-NOVA-160-200-BEIGE', 'Nova', 'Lits', '160 × 200', 'Beige', 0),
    ('DS-LITS-NOVA-160-200-GRIS', 'Nova', 'Lits', '160 × 200', 'Gris', 0),
    ('DS-LITS-PACO-140-190-ALFA-010', 'Paco', 'Lits', '140 × 190', 'Alfa 010', 0),
    ('DS-LITS-PACO-90-190-ODESSA-020', 'Paco', 'Lits', '90 × 190', 'Odessa 020', 0),
    ('DS-LITS-RIXOS-140-190-SOFT-02', 'Rixos', 'Lits', '140 × 190', 'Soft 02', 0),
    ('DS-LITS-RIXOS-140-190-SOFT-09', 'Rixos', 'Lits', '140 × 190', 'Soft 09', 0),
    ('DS-MATELAS-MATELAS-COMFORT-SEUL-90-200-STANDARD', 'Matelas Comfort seul', 'Matelas', '90 × 200', 'Standard', 0),
    ('DS-MEUBLES-TV-AMBRE-150-40-60-CM-NOYER', 'Ambre', 'Meubles TV', '150 × 40 × 60 cm', 'Noyer', 390),
    ('DS-POUFS-ORION-POUF-P-SOFT-03', 'Orion pouf', 'Poufs', 'P', 'Soft 03', 0),
    ('DS-SALONS-COMPLETS-BELIZE-SALON-3-3-1-SOFT-05', 'Belize salon', 'Salons complets', '3+3+1', 'Soft 05', 0),
    ('DS-SALONS-COMPLETS-GRANDE-3-2-1-KR3888', 'Grande', 'Salons complets', '3+2+1', 'KR3888', 0),
    ('DS-SALONS-COMPLETS-LORIS-3-2-1-CREMONA-06', 'Loris', 'Salons complets', '3+2+1', 'Cremona 06', 0),
    ('DS-SALONS-COMPLETS-MONZA-3-2-1-SOFT-13', 'Monza', 'Salons complets', '3+2+1', 'Soft 13', 0),
    ('DS-SALONS-COMPLETS-ODESSA-3-2-2-CREMONA-06', 'Odessa', 'Salons complets', '3+2+2', 'Cremona 06', 0),
    ('DS-SALONS-COMPLETS-ORION-SALON-3-3-1-SOFT-03', 'Orion salon', 'Salons complets', '3+3+1', 'Soft 03', 0),
    ('DS-SALONS-COMPLETS-TORRES-SALON-LORIS-NOYER-3-2-1-SOFT-03', 'Torres salon Loris noyer', 'Salons complets', '3+2+1', 'Soft 03', 0),
    ('DS-TABLES-BASSES-AXEL', 'Axel', 'Tables basses', '', '', 490),
    ('DS-TABLES-BASSES-HELEN-120-70-45-CM', 'Helen', 'Tables basses', '120 × 70 × 45 cm', '', 290),
    ('DS-TABLES-BASSES-IBIZA-120-70-45-CM-NOYER', 'Ibiza', 'Tables basses', '120 × 70 × 45 cm', 'Noyer', 249),
    ('DS-TABLES-BASSES-ICONIC-120-70-45-CM-TRAVERTIN', 'Iconic', 'Tables basses', '120 × 70 × 45 cm', 'Travertin', 390),
    ('DS-TABLES-BASSES-JELENA-120-70-45-CM', 'Jelena', 'Tables basses', '120 × 70 × 45 cm', '', 390),
    ('DS-TABLES-BASSES-LEA-130-70-45-CM-TRAVERTIN', 'Léa', 'Tables basses', '130 × 70 × 45 cm', 'Travertin', 290),
    ('DS-TABLES-BASSES-MARBELLA-80-80-40-CM-NOYER-AVEC-PIEDS', 'Marbella', 'Tables basses', '80 × 80 × 40 cm', 'Noyer avec pieds', 490),
    ('DS-TABLES-BASSES-NEIGE-120-70-45-CM-TRAVERTIN-CLAIR', 'Neige', 'Tables basses', '120 × 70 × 45 cm', 'Travertin clair', 290),
    ('DS-TABLES-BASSES-PILA-80-80-4045-CM', 'Pila', 'Tables basses', '80 × 80 × 40–45 cm', '', 390),
    ('DS-TABLES-BASSES-RONDIN-90-45-CM-TRAVERTIN', 'Rondin', 'Tables basses', 'Ø 90 × 45 cm', 'Travertin', 390),
    ('DS-TABLES-BASSES-TABLE-BASSE-AMBRE-120-70-45-CM-NOYER', 'Table basse Ambre', 'Tables basses', '120 × 70 × 45 cm', 'Noyer', 290),
    ('DS-TABLES-BASSES-TABLE-BASSE-DUO-CERAMIQUE-PLATEAU-PIED-TRAVERTIN-NOYER', 'Table basse Duo céramique', 'Tables basses', 'Plateau + pied', 'Travertin / noyer', 0),
    ('DS-TABLES-BASSES-TABLE-BASSE-ICONIC-120-NOYER', 'Table basse Iconic', 'Tables basses', '120', 'Noyer', 0),
    ('DS-TABLES-BASSES-TABLE-BASSE-JOSEPHINE-120-TRAVERTIN', 'Table basse Joséphine', 'Tables basses', '120', 'Travertin', 0),
    ('DS-TABLES-BASSES-TABLE-BASSE-MAYA-90-NOYER', 'Table basse Maya', 'Tables basses', '90', 'Noyer', 0),
    ('DS-TABLES-BASSES-TABLE-BASSE-PILA-TOUT-NOYER', 'Table basse Pila', 'Tables basses', '', 'Tout noyer', 0),
    ('DS-TABLES-BASSES-TABLE-BASSE-TROPHEE-120-70-MARBRE-BEIGE-PIED-DORE', 'Table basse Trophée', 'Tables basses', '120 × 70', 'Marbre beige / pied doré', 0),
    ('DS-TABLES-BASSES-TABLES-BASSES-GIGOGNES-DUO-PILA-PLATEAU-PIED-CERAMIQUE-TRAVERTIN', 'Tables basses gigognes Duo Pila', 'Tables basses', 'Plateau + pied', 'Céramique travertin', 0),
    ('DS-TABLES-BASSES-TESSA', 'Tessa', 'Tables basses', '', '', 590),
    ('DS-TABLES-A-MANGER-ALEXANDRE-BLANC', 'Alexandre', 'Tables à manger', '', 'Blanc', 690),
    ('DS-TABLES-A-MANGER-ANASTASIA-RALLONGE-160200-90-75-CM-NOYER', 'Anastasia rallonge', 'Tables à manger', '160–200 × 90 × 75 cm', 'Noyer', 890),
    ('DS-TABLES-A-MANGER-ANASTASIA-RALLONGE-160200-90-75-CM-TRAVERTIN', 'Anastasia rallonge', 'Tables à manger', '160–200 × 90 × 75 cm', 'Travertin', 890),
    ('DS-TABLES-A-MANGER-AURORE-NOYER', 'Aurore', 'Tables à manger', '', 'Noyer', 450),
    ('DS-TABLES-A-MANGER-CALYPSO-TRAVERTIN', 'Calypso', 'Tables à manger', '', 'Travertin', 690),
    ('DS-TABLES-A-MANGER-EPONA-TRAVERTIN', 'Epona', 'Tables à manger', '', 'Travertin', 690),
    ('DS-TABLES-A-MANGER-LEA-TRAVERTIN', 'Léa', 'Tables à manger', '', 'Travertin', 690),
    ('DS-TABLES-A-MANGER-NEIGE-180-90-75-CM-TRAVERTIN-CLAIR', 'Neige', 'Tables à manger', '180 × 90 × 75 cm', 'Travertin clair', 590),
    ('DS-TABLES-A-MANGER-ORIANO-RALLONGE-140180-100-CM-NOYER', 'Oriano rallonge', 'Tables à manger', '140–180 × 100 cm', 'Noyer', 890),
    ('DS-TABLES-A-MANGER-ORIANO-RALLONGE-140180-100-CM-TRAVERTIN-CLAIR', 'Oriano rallonge', 'Tables à manger', '140–180 × 100 cm', 'Travertin clair', 890),
    ('DS-TABLES-A-MANGER-PONTA-NOYER', 'Ponta', 'Tables à manger', '', 'Noyer', 790),
    ('DS-TABLES-A-MANGER-SOFIA-RALLONGE-125165-100-80-CM-TRAVERTIN-BEIGE', 'Sofia rallonge', 'Tables à manger', '125–165 × 100 × 80 cm', 'Travertin / beige', 790),
    ('DS-TABLES-A-MANGER-TABLE-RONDE-VICTORIA-110-NOYER', 'Table ronde Victoria', 'Tables à manger', '110', 'Noyer', 0),
    ('DS-TABLES-A-MANGER-TABLE-A-MANGER-ICONIC-180-CERAMIQUE-TRAVERTIN', 'Table à manger Iconic', 'Tables à manger', '180', 'Céramique travertin', 0),
    ('DS-TABLES-A-MANGER-TABLE-A-MANGER-JOSEPHINE-180-TRAVERTIN', 'Table à manger Joséphine', 'Tables à manger', '180', 'Travertin', 0),
    ('DS-TABLES-A-MANGER-TABLE-A-MANGER-OPHELIA-180-MARBRE-BLANC-GRIS-PIED-DORE', 'Table à manger Ophelia', 'Tables à manger', '180', 'Marbre blanc-gris / pied doré', 0),
    ('DS-TABLES-A-MANGER-VANESSA-RALLONGE-160200-90-CM-NOYER', 'Vanessa rallonge', 'Tables à manger', '160–200 × 90 cm', 'Noyer', 890)
  ) as v(reference, name, category, dimensions, color, price)
 where not exists (select 1 from public.deco_articles a where a.reference = v.reference)
on conflict (id) do nothing;

-- L'application relit les données dès que ce numéro change.
update public.deco_gestion_meta set version = version + 1;

-- Contrôle : nombre de produits et de pièces par catégorie.
select coalesce(nullif(category, ''), '(sans catégorie)') as categorie,
       count(*)                                  as produits,
       count(*) filter (where price = 0)         as sans_prix,
       sum(stock)                                as pieces_en_stock
  from public.deco_articles
 group by 1
 order by 1;
