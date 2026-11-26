Models must be trained only on independently verified real project records.
Legacy CSVs and existing artifacts without verified provenance are not accepted as production models.

Cost training reads reviewed historical projects with complete actual final costs, area,
location and construction inputs. The reviewer must be different from the importer.
Operational projects, including completed projects, are not automatically training records.

Delay training requires a reviewed CSV matching
`backend/data_pipeline/verified_delay_template.csv`. Each row contains a project ID,
an observation date before planned and actual completion, both completion dates,
independent review details and evidence. The five observed inputs (0–100) are
schedule slip, overdue milestones, procurement delays, forecast cost overrun and
labour shortfall. Do not fill missing observations with invented values.
Evaluation groups snapshots by project to prevent train/test leakage.

Run offline from the repository root:

```powershell
.\.venv\Scripts\python.exe backend\data_pipeline\train_models.py --delay-csv PATH_TO_REVIEWED_CSV
```

Alternatively run `backend\data_pipeline\run_pipeline.bat` with the same arguments.
Training is blocked when verified data or validation evidence is insufficient;
existing artifacts are preserved. Successful training writes matching model and
metadata files with provenance, held-out metrics and an integrity hash. Deploy
both files together. Vercel requests do not perform persistent model training.

There is no rate/formula fallback presented as ML. Missing verified artifacts
produce an explicit model-not-ready state. A zero verified count must stay zero
until actual records have passed independent review.
