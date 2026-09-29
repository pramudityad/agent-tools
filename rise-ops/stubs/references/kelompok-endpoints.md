# Kelompok (class-group)

Not yet a `rise-ops` command — the endpoints below. Reachable in the UI at
`/lecture/dashboard/<class_id>/groups`.

| purpose | call |
| :--- | :--- |
| read | `GET /v1/class-group/class/{class_id}/state` |
| counts | `GET …/summary` (`total_assigned`, `total_unassigned`, `is_ready_to_finalize`) |
| auto / manual create | `POST …/generate` `{create_mode:"auto"\|"manual", member_per_group:N}` |
| **write the groups** | `PUT …/replace-all` `{groups:[{title, max_member, member_user_data_ids:[…]}]}` |
| show to students | `PUT …/visibility` `{is_visible:true}` |

- `replace-all` is whole-table: it overwrites every group, so send the complete set.
- **Leader = the first id in `member_user_data_ids`** (`is_leader` is positional, never sent).
- Saving leaves `status:"draft"` with `is_visible_to_student:false` — students see nothing
  until visibility flips. `max_member` is per group; unassigned students stay unassigned.
- Resolve NIM → `user_data_id` from `/state`'s `unassigned` list (has `user_nim` + name).
- Not covered by an ADR, same as `discussion`: class-wide, keyed on `lecture_class_id`.
- Write the payload to the audit log by hand — no `rise-ops` command means no automatic entry.
