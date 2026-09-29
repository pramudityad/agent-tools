# Indonesian public datasets for a course lab — what actually answers to a script

All rows verified 2026-09-19 by direct request (curl / API / Wayback CDX), no browser. A brief
that names a dataset is a commitment, so probe first and freeze afterwards.

## Verified ladder

| Source | Probe | Verdict |
| :---- | :---- | :---- |
| `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.71.01.1001` | 200, keyless: `Jawa Barat / Kota Bogor / Bogor Selatan / Batu Tulis`, **17 slots × 3 days** | 🟢 usable as-is |
| `https://wilayah.id/api/{provinces,regencies/32,districts/32.71,villages/32.71.01}.json` | 200 each; code format `32.71.01.1001` is exactly what BMKG accepts | 🟢 the code master |
| `https://webapi.bps.go.id/v1/api/list/model/data/domain/{kode}/var/{var}/key/{key}` | endpoint alive (`{"status":"Error","message":"Parameter Key is Missing."}`), docs at `webapi.bps.go.id/documentation`, free key at `/developer/register` | 🟡 works, needs one key — good for any BPS indicator (IPM, pengangguran, RLS, poverty) for every province uniformly |
| `https://web-api.bps.go.id/download.php?f=…` | 200, `application/pdf`, 20.3 MB *Data and Information of Poverty in Regency/Municipality 2024* | 🟡 background reading, not a seed (PDF ⇒ manual transcription) |
| `https://www.bps.go.id/…` (statistics-table, publication pages) | **403 Cloudflare "Just a moment"** to curl, `web_extract` and Jina Reader alike | 🔴 never promise a student a URL here. Existence of the tables can still be proven via CDX: `web.archive.org/cdx/search/cdx?url=<host>&matchType=domain&filter=original:.*miskin.*&collapse=urlkey&output=json` |
| CKAN provincial portals `data.<prov>.go.id/api/3/action/package_search?q=…` | **jateng ✅** (`success:true`, 596 datasets incl. poverty + APBD), **aceh ✅**, **opendata.magelangkab.go.id ✅**; **jabar 403 JabarCloud**, **sulsel 403**, **ntt no DNS**; 12 more hosts (sumut/sumbar/kalsel/kaltim/babel/lampung/bali/papua/malut/bogor/blitar/semarang-kota…) all ❌ | 🔴 not uniform — do not build a 4-slice topic on it. Jateng resources found were 2017–2019, partly pointing at kabupaten portals |
| `data.go.id` datasets | pages extract fine, but resource URLs can be **internal mirrors**: *"APBD tingkat kabupaten"* resolves to `http://10.42.0.10:5000/dataset/…/download/djpk-sdi_anggaran_murni_202212051700.csv`; no CKAN API (`/api/3/action/…` → 404, the site is Next.js) | 🔴 metadata-only for many datasets; always resolve the resource URL, never trust the page |
| `djpk.kemenkeu.go.id/portal/data/apbd` (sikd) | every endpoint `http=000` from a normal network; bulk download form demands name/instansi/NIP/NIK | 🔴 not a lab source (APBD per kab/kota nationally effectively unavailable as a file) |

Discovery techniques that paid off: probe hosts in a loop and classify on `"success": true`;
try the `raw.githubusercontent.com` **and** the GitHub Pages mirror of a region dataset; when a
site is Cloudflare-walled use Wayback CDX to prove a table exists before quoting it.

## Worked topic: T3 "Cuaca Ekstrem per Desa" (BMKG) — replaced a public-data topic that could not be sourced

Why it won: the only public topic where **every** group's slice works keyless. The poverty/APBD
version died on the two dead rows above, and forcing it would have meant manual prep the students
could not verify themselves.

- Seed: pull `wilayah.id` (4 levels) → call BMKG once per desa → write
  `data/raw/t3_publik/prakiraan_cuaca.csv` + `SOURCE.md` (snapshot date, adm4 list, slot count).
  Then **freeze**: the repo tabulates the committed CSV, never the live API.
- Payload: `lokasi` (provinsi/kotkab/kecamatan/desa + adm1–adm4) and `cuaca` with fields
  `utc_datetime, local_datetime, time_index, t, hu, tp, tcc, ws, wd, wd_deg, wd_to, vs, vs_text,
  weather, weather_desc, image, analysis_date`.
- Grain: *one row = one desa per forecast slot* (daily roll-up as the alternative).
- Dimensions: `dim_date`; `dim_wilayah` **Type 2** (hierarchy prov→kab→kec→desa, join on code —
  kecamatan/desa names repeat across kabupaten); `dim_slot`; `dim_cuaca` with an **`Unknown`
  member** (the integer `weather` code ships without a dictionary).
- Additivity: `tp` additive; `t/hu/ws/tcc` non-additive (min/max/avg, never SUM);
  `jumlah_desa_siaga` semi-additive snapshot — all three classes in one fact, which the synthetic
  topics do not manage.
- Naturally dirty, no injection needed — all of it **measured** on the real 1,156-row Kota Bogor
  CSV, so the brief can quote counts instead of adjectives:
  `utc_datetime` vs `local_datetime` differ by exactly +7 h (`15:00:00` → `22:00:00`);
  `vs` **and** `vs_text` are empty in **1,156/1,156** rows (a whole column that survives to the
  warehouse unless a test drops it — `weather_desc_en` is the column that does carry the English
  wording); `weather` codes `0` (70 rows) and `1` (966 rows) **share the description "Cerah"**, so
  the dictionary is not 1:1 and `dim_cuaca` cannot lean on the description;
  `time_index` is an **hour offset from analysis (11–37)**, not a clock hour — use `local_datetime`;
  `tp` is 0 in **812/1,156** rows with a 1.4 mm maximum (dry snapshot ⇒ never let rain be the only
  measure, or the team's insight is empty); `analysis_date` is a single value
  (`2026-09-19T12:00:00`) and reads like a slot timestamp although it is snapshot metadata;
  **11 desa names exist in both Kota Bogor and Kab. Bogor** (`Babakan`, `Bantarjati`, `Batu Tulis`,
  `Cibadak`, `Curug`, `Kedung Waringin`, `Sukadamai`, `Sukaresmi`, `Sukasari`, `Tajur`,
  `Tegallega`) — the proof that joining on names is wrong and `dim_wilayah` must join on codes.
- Honest limits to state in the brief: **BMKG public API is a 3-day forecast — there is no public
  archive** (history needs a Data Online account, i.e. instructor-side), and the dataset is small
  (~17 rows/desa), which is a feature for an 80-minute checkpoint but means idempotency is proven
  by re-pull, not by volume.
- Slice/decision pattern that keeps teams from copying: one province per team, one named
  decision-maker (BPBD head, duty officer, agriculture office), one distinct decision — *which
 desa gets tomorrow's early warning*, *what hour to raise the alert level* (forces slot grain,
 not daily), *which kabupaten's data is unfit for a decision*, *whether the planting calendar
 must move*.

 ## Pulling the seed — measured behaviour (2026-09-19)

 The puller exists twice: as the course script `02-Projects/Cakrawala/Business Intelligence
 Systems/tools/t3_seed_pull.py` (modes `master` / `cuaca`, slice codes in a dict) and as the
 portable `scripts/probe-dataset-sources.py pull`. Both cache every raw response on disk, which is
 what makes the offline re-run — and therefore the idempotency proof — honest.

 | Slice | Cakupan | Hasil |
 | :---- | :---- | :---- |
 | Kota Bogor `32.71` | 6 kecamatan, 68 desa | **1,156 baris** (17 slot × 68 desa), 28 kolom, 0 desa gagal, **69 s** at 1 s/request |
 | Kota Semarang `33.74` | 16 kecamatan, 177 desa | pulled without failures |
 | (locked 2026-09-20) | Kota Makassar `73.71`, Kota Denpasar `51.71` | one kota per team keeps each slice < ~2,000 rows and the 80-minute block real. k6 moved Kota Kupang `53.71` -> Kota Denpasar on 2026-09-20 (`tools/t3_seed_pull.py` SLICES + `seed/t3_publik/k6/SOURCE.md`, 774 rows / 43 desa) |

 Second run of the same slice: `baris di CSV = 1,156 | baris di cache = 1,156 → IDEMPOTEN`, finished
 in **0.076 s** without touching the network. Quote that in the brief — it is why an in-class
 idempotency test cannot fail for reasons the students did not cause.

 Pitfalls that only appear at pull time:

 - BMKG requires a **full adm4** (10-digit desa code); adm1/adm2/adm3 all return 404.
 - `data[].cuaca` is a **list of lists**. A one-level flatten raises
 `ValueError: dictionary update sequence element #0 has length 19`; iterate the inner list.
 - One request ≈ 7 KB and ≈ 1 s of wall clock per desa — 68 desa is a coffee break, but a whole
 province is not; slice by kabupaten/kota, not by province.
 - Write each slice to its own directory (`data/raw/t3_publik/<slice>/`) so four teams' pulls never
 overwrite each other, and record the snapshot date in `SOURCE.md`.
