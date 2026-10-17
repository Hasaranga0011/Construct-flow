# Legacy Synthetic Datasets — Deprecated

> [!CAUTION]
> **DO NOT USE THESE FILES FOR MODEL TRAINING OR EVALUATION.**
> The CSV datasets in this folder (`construction_project_dataset.csv`, `construction_project_performance_dataset.csv`, `construction_project_data.csv`, and derivatives) are legacy synthetic files containing uniform random noise.

## Reasons for Deprecation:
1. **Uncorrelated Random Noise**: The 50,000-row and 10,000-row files exhibit zero real statistical correlation between project features and actual outcomes.
2. **Artificial Formula Fitting**: Previous models fitted to these files merely memorized the artificial formulas and random generators used in generation scripts, producing deceptive validation metrics ($R^2 \approx 0.95$) that do not reflect real construction project outcomes in Sri Lanka.
3. **Missing Core Dimensions**: These files lacked genuine Sri Lankan geographic districts, project structural specifications, actual contractor Bills of Quantities (BOQ), and real inflation/price indices.
4. **Target Label Artifacts**: Constant label columns such as "Excellent" and "Exceptional" provided no meaningful variance for predictive decision-making.

## Active Real-Data Policy:
- The ConstructFlow AI Cost Estimator is evaluated **strictly against real completed and historical projects** using **MAPE (Mean Absolute Percentage Error)** and **MAE**.
- Delay risk forecasting is **100% rule-based** computed from live milestones, purchase order fulfillment velocity, and on-site attendance coverage.
- Real historical project data is harvested directly from completed projects (`project_expenses`, received `purchase_orders`, `salary_slips`) or imported by administrators from verified contractor/QS BOQs with strict district and cost validation.
