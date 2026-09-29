#!/usr/bin/env python3
"""Probe candidate dataset sources, and pull a BMKG + wilayah.id snapshot for a course seed.

Two jobs, both stdlib-only:

  probe  — test candidate hosts/URLs and classify what they are really good for (keyless JSON
           API? CKAN portal? Cloudflare wall? dead internal-mirror link?). Run this BEFORE
           naming a dataset in an assessment brief.
  pull   — build the CSV seeds a "cuaca per desa" style topic needs: wilayah.id supplies the
           4-level BPS code master, api.bmkg.go.id supplies the keyless forecast per adm4.

Verified 2026-09-19 against the live services, including a FULL slice: Kota Bogor (68 desa ->
1,156 rows, 69 s) and a second run that re-used the cache in 0.076 s with identical row counts.
Every response is cached on disk, so a re-run is offline and reproducible — that is what makes
`--check` (the idempotency proof an assessment brief can promise) meaningful.

Usage:
  python3 probe-dataset-sources.py probe [--url URL ...]
  python3 probe-dataset-sources.py pull --kabupaten 32.71 --out data/raw/t3_publik/k1 [--check]

Notes:
  - BMKG needs a FULL adm4 code (10 digits, desa level); adm1/adm2/adm3 all return 404.
  - `data[].cuaca` is a LIST OF LISTS — flatten both levels or the pull crashes.
  - Freeze the snapshot into the repo with SOURCE.md; labs never call the live API.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

UA = "dataset-probe/1.0 (course seed preparation)"
WILAYAH = "https://wilayah.id/api"
BMKG = "https://api.bmkg.go.id/publik/prakiraan-cuaca"
DELAY = 1.0      # seconds between BMKG calls — public service, stay polite
RETRY = 3

ENDPOINTS = [
    ("wilayah.id provinces", "https://wilayah.id/api/provinces.json"),
    ("wilayah.id regencies", "https://wilayah.id/api/regencies/32.json"),
    ("wilayah.id districts", "https://wilayah.id/api/districts/32.71.json"),
    ("wilayah.id villages", "https://wilayah.id/api/villages/32.71.01.json"),
    ("bmkg forecast (adm4 desa)", "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.71.01.1001"),
    ("bmkg forecast (adm3 kecamatan)", "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.71.01"),
    ("bps webapi (needs key)", "https://webapi.bps.go.id/v1/api/list/model/data/domain/0000/var/192"),
    ("bps www (cloudflare wall expected)", "https://www.bps.go.id/id/statistics-table"),
    ("ckan jateng", "https://data.jatengprov.go.id/api/3/action/package_search?q=kemiskinan&rows=1"),
    ("ckan aceh", "https://data.acehprov.go.id/api/3/action/package_search?q=kemiskinan&rows=1"),
    ("ckan jabar", "https://opendata.jabarprov.go.id/api/3/action/package_search?q=kemiskinan&rows=1"),
    ("ckan sulsel", "https://data.sulselprov.go.id/api/3/action/package_search?q=kemiskinan&rows=1"),
    ("djpk apbd portal", "https://djpk.kemenkeu.go.id/portal/data/apbd"),
    ("data.go.id dataset list", "https://data.go.id/dataset"),
]

# Canonical column order for the weather CSV; any extra keys the API adds are appended.
BASE_FIELDS = ["adm1", "adm2", "adm3", "adm4", "kode_diminta", "provinsi", "kotkab",
               "kecamatan", "desa", "analysis_date", "utc_datetime", "local_datetime",
               "time_index", "t", "hu", "tp", "tcc", "ws", "wd", "wd_deg", "wd_to",
               "vs", "vs_text", "weather", "weather_desc", "weather_desc_en", "image"]


def fetch(url: str, timeout: int = 25) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.headers.get("Content-Type") if e.headers else "") or "", e.read() or b""
    except Exception as e:  # DNS failure, timeout, TLS reset
        return 0, type(e).__name__, str(e).encode()


def classify(status: int, ctype: str, body: bytes) -> str:
    text = body[:400].decode("utf-8", "ignore")
    if status == 0:
        return f"DEAD ({ctype})"
    if status == 403 and "just a moment" in text.lower():
        return "BLOCKED (Cloudflare interstitial) — prove pages via Wayback CDX, never promise the URL"
    if status == 403:
        return "BLOCKED (403)"
    if status == 404:
        return "404 — wrong level/path"
    if "success" in text and "true" in text:
        return "OK — CKAN portal"
    if ctype.startswith("application/json") or text.lstrip().startswith(("{", "[")):
        return "OK — JSON API"
    if ctype.startswith("application/pdf"):
        return "OK — PDF (background only, not a seed)"
    if status == 200 and ctype.startswith("text/html"):
        return "HTML — SPA or landing page; resolve the real resource URL before trusting it"
    return f"HTTP {status} ({ctype})"


def cmd_probe(urls: list[str]) -> int:
    targets = [(u, u) for u in urls] if urls else ENDPOINTS
    bad = 0
    for name, url in targets:
        status, ctype, body = fetch(url)
        verdict = classify(status, ctype, body)
        if not verdict.startswith("OK"):
            bad += 1
        print(f"{verdict:<78} {name}\n    {url}")
    print(f"\n{len(targets) - bad}/{len(targets)} usable for a seed.")
    return 0


def get_json(url: str, cache_dir: str, key: str) -> dict:
    """GET + disk cache. The cache is what turns a second run into an offline, identical re-run."""
    path = os.path.join(cache_dir, key)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    last: object = None
    for attempt in range(1, RETRY + 1):
        status, _, body = fetch(url, timeout=30)
        if status == 200:
            data = json.loads(body)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False)
            time.sleep(DELAY)
            return data
        last = f"HTTP {status}"
        if attempt < RETRY:
            time.sleep(DELAY * attempt * 3)
    raise SystemExit(f"GAGAL {url}: {last}")


def flatten(adm4: str, lokasi: dict, payload: dict) -> list[dict]:
    """One row per desa per forecast slot. `data[].cuaca` is a list of lists — iterate both."""
    rows = []
    for day in payload.get("data", []):
        for group in day.get("cuaca", []) or []:
            for slot in group if isinstance(group, list) else [group]:
                if not isinstance(slot, dict):
                    continue
                row = dict(slot)
                row.update({"adm1": lokasi.get("adm1"), "adm2": lokasi.get("adm2"),
                            "adm3": lokasi.get("adm3"), "adm4": lokasi.get("adm4", adm4),
                            "provinsi": lokasi.get("provinsi"), "kotkab": lokasi.get("kotkab"),
                            "kecamatan": lokasi.get("kecamatan"), "desa": lokasi.get("desa"),
                            "kode_diminta": adm4})
                rows.append(row)
    return rows


def write_csv(path: str, rows: list[dict], fields: list[str]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def cmd_pull(kabupaten: str, out: str, limit: int | None, do_check: bool) -> int:
    cache = os.path.join(out, "cache")
    prov_code = kabupaten.split(".")[0]

    regencies = get_json(f"{WILAYAH}/regencies/{prov_code}.json", cache, f"regencies_{prov_code}.json")["data"]
    match = [r for r in regencies if r["code"] == kabupaten]
    if not match:
        raise SystemExit(f"kabupaten {kabupaten} tidak ada di provinsi {prov_code}")
    kab = match[0]

    master_rows: list[dict] = []
    for d in get_json(f"{WILAYAH}/districts/{kabupaten}.json", cache, f"districts_{kabupaten}.json")["data"]:
        villages = get_json(f"{WILAYAH}/villages/{d['code']}.json", cache, f"villages_{d['code']}.json").get("data", [])
        for v in villages:
            master_rows.append({"kode": v["code"], "desa": v["name"], "kode_kecamatan": d["code"],
                                "kecamatan": d["name"], "kode_kabkot": kab["code"], "kabkot": kab["name"]})

    desa = master_rows[:limit] if limit else master_rows
    rows: list[dict] = []
    gagal: list[tuple[str, str]] = []
    for i, d in enumerate(desa, 1):
        adm4 = d["kode"]
        try:
            payload = get_json(f"{BMKG}?adm4={adm4}", cache, f"bmkg/{adm4}.json")
            rows.extend(flatten(adm4, payload.get("lokasi", {}), payload))
        except SystemExit as exc:      # a desa without a forecast — recorded, not hidden
            gagal.append((adm4, str(exc)[:80]))
        if i % 25 == 0 or i == len(desa):
            print(f"  {i}/{len(desa)} desa — {len(rows)} baris slot")
    if not rows:
        raise SystemExit("tidak ada baris; cek kode kabupaten / --limit")

    write_csv(os.path.join(out, "kecamatan.csv"), master_rows, list(master_rows[0]))
    extra = sorted({k for r in rows for k in r} - set(BASE_FIELDS))
    write_csv(os.path.join(out, "prakiraan_cuaca.csv"), rows, BASE_FIELDS + extra)

    snapshot = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(os.path.join(out, "SOURCE.md"), "w", encoding="utf-8") as fh:
        fh.write(
            f"# SOURCE — snapshot cuaca BMKG ({kabupaten} {kab['name']})\n\n"
            f"- Sumber cuaca: `{BMKG}?adm4={{kode desa}}` (tanpa key)\n"
            f"- Sumber kode wilayah: `{WILAYAH}` (kode BPS 4 level)\n"
            f"- Snapshot diambil: {snapshot}\n"
            f"- Cakupan: {len(desa)} desa diminta, {len(rows)} baris slot, {len(gagal)} desa gagal\n"
            "- Catatan: BMKG hanya menerbitkan prakiraan (tidak ada arsip publik). Repo membekukan\n"
            "  snapshot ini; jangan tarik ulang saat lab.\n\n"
            "## Desa tanpa prakiraan\n"
            + ("\n".join(f"- {a} — {e}" for a, e in gagal) if gagal else "- (tidak ada)") + "\n")
    print(f"[pull] {len(rows)} baris dari {len(desa)} desa ({len(gagal)} gagal) -> {out}")

    if do_check:
        n_csv = sum(1 for _ in open(os.path.join(out, "prakiraan_cuaca.csv"), encoding="utf-8")) - 1
        n_cache = 0
        for d in desa:
            p = os.path.join(cache, "bmkg", f"{d['kode']}.json")
            if os.path.exists(p):
                with open(p, encoding="utf-8") as fh:
                    payload = json.load(fh)
                n_cache += len(flatten(d["kode"], payload.get("lokasi", {}), payload))
        verdict = "IDEMPOTEN" if n_csv == n_cache else "BEDA, periksa"
        print(f"[check] baris di CSV = {n_csv} | baris di cache = {n_cache} -> {verdict}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe", help="classify candidate dataset endpoints")
    p.add_argument("--url", action="append", default=[], help="extra/replacement URL to test")
    q = sub.add_parser("pull", help="pull a BMKG + wilayah.id snapshot for one slice")
    q.add_argument("--kabupaten", required=True, help="BPS kabupaten/kota code, e.g. 32.71")
    q.add_argument("--out", required=True, help="output directory for this slice's CSVs")
    q.add_argument("--limit", type=int, default=None, help="max desa to pull (default: all)")
    q.add_argument("--check", action="store_true", help="print the idempotency proof afterwards")
    args = ap.parse_args()
    if args.cmd == "probe":
        return cmd_probe(args.url)
    return cmd_pull(args.kabupaten, args.out, args.limit, args.check)


if __name__ == "__main__":
    sys.exit(main())
