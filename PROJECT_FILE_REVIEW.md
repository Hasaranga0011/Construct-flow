# Project file review

Reviewed 2026-11-17. Following explicit user approval, the 18 historical frontend test-export folders listed below and the empty root files `git` and `main` were removed. Actual reclaimed file size: 593.3 MiB. All 20 approved targets were confirmed absent after cleanup. Other files were retained.

## Approved cleanup completed

All paths below are relative to `frontend/`:

```text
.validation-remaining-final-platforms
.validation-remaining-platforms
.validation-full-platforms
.validation-full-live
.validation-ui-web-enhanced
.validation-ui-web-wrapping
.validation-full-web-fixed
.validation-full-web
.validation-ui-web-wrapping-final
.validation-ui-web-next
.validation-ui-web
.validation-remaining-auth-final
.validation-full-web-final
.validation-web
.validation-full-android
.validation-ui-native
.validation-full-ios
.validation-native
```

The inventory below records the pre-cleanup review; removed folders are historical entries.

## Generated files

26 generated/cache folders occupied approximately 761 MiB before final screenshots. Historical test exports can be regenerated and are cleanup candidates after keeping the latest evidence.

| Folder | Approximate MiB |
| --- | ---: |
| .validation-ui | 60.5 |
| frontend/.validation-remaining-final-platforms | 52.2 |
| frontend/.validation-remaining-platforms | 52.2 |
| frontend/.validation-full-platforms | 52.2 |
| .validation-audit | 40.8 |
| .validation-tools | 40.3 |
| frontend/.validation-full-live | 34.2 |
| frontend/.validation-ui-web-enhanced | 31.8 |
| frontend/.validation-ui-web-wrapping | 31.8 |

Keep active preview exports and development caches while their servers run. Review .validation-db separately: it contains QA identity/state needed for repeatable testing; do not delete that directory wholesale.

## One-off scripts needing review

50 candidates were identified; 49 have no literal filename references in scanned source/config/documentation. This is a screening heuristic, not proof that a script is unused. The complete local inventory, including all candidate paths and references, is in [.validation-ui/current/file-inventory.json](.validation-ui/current/file-inventory.json).

| Group | Examples | Recommendation |
| --- | --- | --- |
| Root scratch scripts | scratch_fix_layout.py, scratch_fix_proj_ts.py, scratch_db_insert.py, scratch_test_api.py | Archive completed experiments after reviewing their purpose. |
| Old source rewriting tools | fix_types.py, patch_po.py, frontend/fix_imports.py, frontend/patch_registers.py | Cleanup candidates if their edits have already been incorporated. |
| Scaffold tools | frontend/scaffold_admin.py, frontend/scaffold_all.py | Archive if no longer used to generate new screens. |
| Database diagnostics | check_db.py, backend/check_schema.py, backend/debug_po.py | Keep useful diagnostics; consolidate duplicates after review. |
| Migration/seed scripts | backend/migrate_enum.py, backend/seed_ml_data.py | Retain until their operational purpose is confirmed. |

Do not execute these scripts as a cleanup step: some rewrite source or mutate databases.

## Empty files

Root files `git` and `main` are empty regular files and cleanup candidates.

## Keep

Keep application source, assets, trained models/data, migrations/SQL, dependency lockfiles, vendor fixes, environment/credential files, and active QA state. New dashboard detail pages, shared navigation components and regression tests are used by the application. Dependency folders are required by the current development environment.

No email configuration was changed. New temporary outputs for this task are consolidated under `.validation-ui/current/`.

## Validation of the dashboard/reset changes

- TypeScript and ESLint: passed, zero lint errors/warnings.
- Browser workflow scenarios: 36 passed, including metric and panel navigation for all six roles.
- Recovery browser scenarios: 4 passed, using intercepted fixtures without sending emails.
- Responsive checks: 40 light-theme checks and 12 dark-theme checks passed.
- New detail destinations: supplier order register/history, worker site, and site-manager assigned sites.

Expired recovery links cannot authorize password changes. The reset page now replaces disabled password fields with a clear recovery notice and a request-new-link action; valid recovery sessions retain the editable password form.
