# Lab HOLD — worked example pattern

Generic rule boiled from BI Sesi 01 (105-min slot). Reuse for every lab, don't patch each naskah ad-hoc.

## When to use
- Slide has `**HOLD**` and lab produces a graded artifact (D0-D13).
- Project HOLD as task list. After ~5 min of pair work, overlay/reveal `CONTOH` as scaffold.

## Generic shape (in naskah KONTEN, after FINE, before HOLD)
```
CONTOH <course-context> (tampilkan setelah 5 menit lab — jangan di awal, biar mereka coba dulu):
| # | Keputusan/Artefak | Siapa (peran spesifik) | Frekuensi/Kriteria | Data hari ini | Data seharusnya | Tipe/Catatan |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | ... | <named role> | ... | intuisi/spreadsheet | <source table.col> | ... | Intuisi |
| 2 | **⭕ DILINGKARI — ...** | <named role> | ... | ... | ... | ... | Akan jadi D<n+1> |
| 3 | ... | <named role> | ... | ... | ... | ... | - |
| 4 | ... | <named role> | ... | intuisi | ... | ... | Intuisi |
| 5 | ... | <named role> | ... | ... | ... | ... | - |
Aturan contoh: baris 1 & 4 = intuisi (memenuhi minimal 2), baris 2 dilingkari = calon D berikutnya, kolom Siapa = peran orang bukan departemen.
```

## BI Sesi 01 canonical instantiation (NusaPay)
| # | Keputusan | Siapa | Frekuensi | Data hari ini | Data seharusnya | Tipe | Catatan |
| 1 | Prioritaskan biller saat PARTNER_A timeout | Head of Ops (shift malam) | Jam-an | Grup WA + ingatan | `transactions` success_rate per `biller_code` per jam + `fulfillments.metadata` latency | Operasional | Intuisi |
| 2 | **⭕ Naik/turunkan routing_priority PARTNER_C (game voucher)** | Product Ops Lead | Mingguan | Spreadsheet manual | Agregasi `transactions` JOIN `fulfillments` per `biller_code` | Taktis | → D1 (8 pertanyaan bisnis, Sesi 2) |
| 3 | Refund manual atau tunggu retry | CS Lead | Harian | Screenshot `orders.status` | Timeline `orders`+`transactions`+`refunds` | Operasional | - |
| 4 | Nego harga / tambah biller baru | Head of Procurement | Bulanan | Feeling + email | `ORDER_ITEMS.product_info` + `TRANSACTIONS.biller_price` vs `paid_amount` | Taktis | Intuisi |
| 5 | Masuk pasar baru | CEO | Tahunan | Deck investor | Histori `PRODUCTS`+`TRANSACTIONS`+`ACCOUNT_INQUIRIES` | Strategis | - |

## Per-session swap (don't invent new shapes)
- Sesi 02 (D1 — 8 pertanyaan bisnis): 8-row table, 1 row circled → D2 star schema. Keep same columns.
- Sesi 03 (D2 — star schema): show 1 fact + 2 dims as mini-example, grain sentence = "satu baris = satu order_item per hari".
- Sesi 04-05 (D3/D4 — pipeline): 6-rule checklist, rule 6 = graded emphasis.
- Sesi 06+ (SQL/metrics): 8-question list with timing, or 5-metric dictionary with swap annotation.

Swap rows only; keep HOLD, 5-min delay, and NOTES instruction: "Setelah 5 menit, proyeksikan CONTOH sebagai referensi — jangan di awal."

## Naskah NOTES template
```
**NOTES** `[min 070 · 19:25]` Brief 2 menit, lalu HOLD. Pasangan campur peran, yang kuat menarasikan. Instruktur berkeliling — 15 menit. Setelah 5 menit, proyeksikan CONTOH di atas sebagai referensi — jangan di awal. Yang selesai lebih cepat: langsung ke slide share-out.
```

## Why boiled into rps-deck (not per-naskah patches)
- rps-deck is course-agnostic; the *shape* (HOLD + delayed CONTOH) belongs in the toolkit, concrete rows stay per-course.
- Prevents 14 ad-hoc patches; future authoring inherits the pattern automatically.
- Sesi 01 patch is the committed canonical; Sesi 02-15 reuse via this reference.
