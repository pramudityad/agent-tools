# PRD student template — generic copy-paste version

The 10-section PRD fill-in scaffolding for a PRD-writing UTS, generalized from the SDLC
`Template PRD — UTS.md` (ACC prodi 2026-09-25). Give students the BODY below only — no vault
frontmatter, no course codes, no per-course group/topic names (a generalization pass replaces
`R1/A1/A4` codes and `DARA/SAPA UMKM/Posyandu` with `[…]` placeholders). It ships as a RISE
Materi attachment (md → clean HTML → DOCX+PDF per the publish runbook); the tugas body must
reference this template's exact Materi title before either is published.

Rules baked into the template (do not remove when specializing):
- every `[petunjuk]` prompt is deleted by the student before submit (stated in the intro block);
- examples are one-line SHAPE only — a fill-in pattern like `"…% … dalam … bulan, diukur dari
  …"` — never a filled row (ruling 2026-09-25: students copy filled examples verbatim);
- section 3 forces one NEGATIVE stakeholder + consequence; section 5 forces an `Alasan` per
  Must; section 6 forces a `How Measured` per NFR; section 10 forces adopt/reject decisions
  from a real PRD.

---

**Nama** : [nama lengkapmu]
**NIM** : [NIM]
**Kelompok** : [kode kelompokmu]
**Topik** : [topik sesuai kelompokmu]
**Modul/fitur/proses yang dipilih** : [satu saja, sesuai aturan pengumuman]

---

## 1. Ringkasan dan Latar Belakang

[Jelaskan masalah nyata yang ingin diselesaikan, dan siapa yang mengalaminya — spesifik,
bukan "masyarakat". 1–2 paragraf.]

## 2. Tujuan dan Success Metrics

[Tujuan yang terukur, bukan aspirasi — minimal 2 metrik: apa angkanya, diukur dari mana,
dalam waktu berapa. Contoh bentuk: "…% … dalam … bulan, diukur dari …".]

## 3. Stakeholder dan Persona

[Minimal 5 stakeholder, WAJIB termasuk 1 stakeholder negatif + konsekuensinya kalau terlewat.
Persona 1–2 kalimat untuk 2 stakeholder terpenting — contoh bentuk: "…, usia …, kebiasaan …,
keterbatasan …".]

## 4. Ruang Lingkup

**Termasuk (in-scope):** [proses/fitur yang kamu tulis]

**Tidak termasuk (out-of-scope):** [yang di luar cakupanmu]

[Cakupan PRD-mu adalah SATU PROSES — bukan seluruh super-app, program nasional, atau sistem.]

## 5. Functional Requirements

| ID | Requirement | MoSCoW | Alasan |
| :-- | :---- | :---- | :---- |
| FR-1 | [satu kemampuan sistem] | Must | [kenapa tidak boleh tidak ada] |

[Minimal 8 requirement. Alasan wajib untuk setiap "Must".]

## 6. Non-Functional Requirements

| ID | Kategori | Requirement | How Measured |
| :-- | :---- | :---- | :---- |
| NFR-1 | Performance | [proses X selesai < N detik] | [cara mengukur] |

[Minimal 5 kategori (performance, security, availability, usability, compliance, dsb.),
semua terukur.]

## 7. Use Case atau User Story Utama

[Minimal SATU use case lengkap — aktor, prakondisi, main flow, alternate flow, exception flow —
atau satu user story dengan acceptance criteria. Harus konsisten dengan stakeholder di bagian 3.]

## 8. Asumsi dan Ketergantungan

[Apa yang kamu anggap benar tapi belum kamu verifikasi — contoh bentuk: "pengguna selalu punya
…". Ini asumsi, bukan fakta; tulis saja apa adanya.]

## 9. Non-Goals

[Apa yang sengaja TIDAK kamu kerjakan dan alasannya — contoh bentuk: "[fitur/integrasi X],
karena di luar satu proses yang jadi cakupanku".]

## 10. Referensi

[Minimal SATU PRD nyata dari risetmu sebelumnya. Tulis: sumbernya (link/nama dokumen), apa yang
kamu ADOPSI, apa yang TIDAK kamu adopsi, dan kenapa. Yang dinilai kemampuanmu mengambil
keputusan dari referensi, bukan menyalinnya.]
