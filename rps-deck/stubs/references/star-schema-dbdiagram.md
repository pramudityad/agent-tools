# Star schema — dbdiagram.io DBML (BI Sesi 03 canonical)

Lab D2 (Sesi 03 Slides.html §21) — grain + star schema that future BI Sesi 04-06 reuse as contract.

## Grain (irreversible)
- **Satu baris = satu order_item per hari** (Kandidat C: `ORDER_ITEMS` + snapshot harian).
- Vote table §10: A (order) cannot answer revenue/hari or status funnel; B (order_item) loses funnel due to `ORDERS.status` overwrite; C answers all four.
- Rule: pilih grain terhalus yang source dukung — agregasi ke atas gratis, disaggregasi mustahil.

## Deliverable shape (1 fact only)
```
dim_date (Type 0) ──┐
dim_product (Type 2) ─┼─► fact_order_item (grain = order_item + date_sk)
dim_biller (Type 1) ──┤      degenerate: order_id, order_item_id, transaction_id
 dim_customer (Type 2) ─┘      measures: amount/quantity/paid_amount (additive), biller_price (non-additive)
dim_order_status (junk) ──────► optional FK
```
Fast-finisher: `dim_campaign` + `bridge_campaign_product` (many-to-many campaign↔product) replaces `product_item_ids` TEXT comma-separated 2.657-item OOM (sesi03-oom-topup.md TICKET-2).

## DBML authoring recipe
1. Create `artifacts/sesi03-star-schema.dbml` (Project database_type PostgreSQL) with:
   - dims: dim_date (PK date_sk YYYYMMDD), dim_product/dim_customer (product_sk/customer_sk bigserial + valid_from/valid_to/is_current), dim_biller (biller_sk serial Type 1), dim_order_status (junk)
   - fact: fact_order_item (fact_sk, FK date_sk/product_sk/biller_sk/customer_sk/status_sk, degenerate IDs, measures with [note: 'ADDITIVE'/'NON-ADDITIVE'])
   - bridge: dim_campaign + bridge_campaign_product (campaign_sk, product_sk)
   - Explicit `Ref: fact_order_item.col > dim_*.col` (7 refs) — **do not also add inline `ref: >` on the same columns**
   - TableGroups: dims_type0/dims_type1/dims_type2/junk/fact/bridge
   - Enums for status
2. Paste at https://dbdiagram.io/d → New Diagram → Import (one file per diagram; STAR is D2, OLTP is separate reference `sesi03-oltp-source.dbml`)
3. Export PNG/SVG for D2 photo before stand-up.

## Pitfalls
- **Duplicate refs:** inline `col [ref: > other.col]` + `Ref: col > other.col` for same endpoint → `References with same endpoints exist`. Canonical fix: keep explicit `Ref:` only, strip inline `ref: >` from fact/bridge FK columns (patched 2026-09-14).
- **Additivity unlabeled:** lab rubric requires every measure tagged additive/semi-additive/non-additive — use `note:` on column.
- **Surrogate keys:** warehouse PK must be integer `*_sk` (not business UUID) to support Type 2 (slide 12).
- **Do not paste OLTP + STAR together:** OLTP has 9 normalized tables with logical FK `reference_id`; STAR is denormalized. Mixing in one diagram collides.

## Files produced 2026-09-14
- `Business Intelligence Systems/artifacts/sesi03-star-schema.dbml` — STAR D2 (paste-ready, duplicate-ref fixed)
- `Business Intelligence Systems/artifacts/sesi03-oltp-source.dbml` — OLTP reference (9 tables, logical FKs, for ERD projection)
