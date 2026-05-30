# Rollback

You always have an escape hatch because **the eject is one-way only at step 8 of the cutover** (disable Lovable Cloud). Until then, both backends exist in parallel.

## During dump (phases 00-50)

Nothing remote is modified. Just `rm -rf eject/out/<ts>` and restart.

## During provision/restore (phases 60-75)

Target project exists but source is untouched. Two options:

- **Keep target, retry**: fix issue, `EJECT_RUN_DIR=... bash eject/eject.sh --from=NN`.
- **Nuke target**: `mgmt_api DELETE "/v1/projects/$TARGET_SUPABASE_PROJECT_REF"`, clear the TARGET_* values from `.env.eject`, rerun from phase 60.

## After frontend rewrite (phase 80)

The app now points at the new project. To go back:

```bash
cp .env.pre-eject.bak .env
```

Then hard-refresh. Lovable Cloud is still active.

## After "Disable Lovable Cloud"

This is the only non-reversible step. Before pulling that lever:
- Verify phase 90 smoke tests pass.
- Let real users use the new backend for 24h.
- Confirm row counts haven't drifted (rerun phase 90 alone).
- Take a final `pg_dump` of source and stash it offline.

If you must roll back after disabling: contact Lovable support — there's no self-serve path.
*** End Patch