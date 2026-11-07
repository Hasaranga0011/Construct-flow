# Construct-flow පද්ධතියේ Machine Learning සහ AI මොඩියුල පිළිබඳ පූර්ණ තාක්ෂණික වාර්තාව
**ලේඛනය සැකසූ දිනය:** 2026 නොවැම්බර් 07  
**පද්ධතිය:** Construct-flow (Construction Management & Forecasting Platform)

---

## 1. විධායක සාරාංශය (Executive Summary)

Construct-flow පද්ධතිය තුළ ඉදිකිරීම් ව්‍යාපෘති කළමනාකරණය, ඇස්තමේන්තුකරණය (Cost Estimation), සහ ප්‍රමාද අවදානම (Delay Risk) හඳුනාගැනීම සඳහා **AI සහ විශ්ලේෂණ මොඩියුල 4 ක්** ක්‍රියාත්මක වේ:

1. **Hybrid Construction Cost Predictor (Scikit-Learn Random Forest Regressor)** - සැබෑ ලෙස Train වන ML මොඩියුලයකි.
2. **Project Delay Risk Engine (ප්‍රමාද අවදානම් විශ්ලේෂකය)** - මුලින් Synthetic ML මොඩලයක් ලෙස පැවති, පසුව නිරවද්‍යතාවය මදිවීම නිසා **100% Rule-Based Live Operational Engine** එකක් බවට පත් කරන ලද මොඩියුලයකි.
3. **AI Quotation & BOQ Estimator (Large Language Model - Anthropic Claude 3.5 Sonnet)** - බාහිර LLM API මඟින් ක්‍රියාත්මක වන Generative AI මොඩියුලයකි.
4. **Interactive What-If Simulator & Offline Fallback Engine** - Frontend/UI මට්ටමින් ක්‍රියාත්මක වන සමාකරණ සහ Fallback පද්ධතියකි.

මෙම වාර්තාව මඟින් එක් එක් මොඩියුලය ඇත්තටම Train වෙනවාද, Hardcoded දත්ත පවතිනවාද, ඒවායේ නිරවද්‍යතාවය (Accuracy) කොපමණද, භාවිතා වන දත්ත වර්ග මොනවාද යන්න 100% විනිවිදභාවයෙන් විග්‍රහ කෙරේ.

---

## 2. මොඩියුල 1: Construction Cost Predictor (ඉදිකිරීම් පිරිවැය පුරෝකථන මොඩියුලය)

* **ප්‍රධාන ගොනු:**
  * Model Pipeline: [`backend/data_pipeline/model_engine.py`](file:///d:/PROJECTS/Construct-flow/backend/data_pipeline/model_engine.py)
  * Training Script: [`backend/data_pipeline/train_models.py`](file:///d:/PROJECTS/Construct-flow/backend/data_pipeline/train_models.py)
  * Model Artifact: `backend/models/cost_predictor.pkl`
  * Metadata & Metrics: [`backend/models/cost_predictor_meta.json`](file:///d:/PROJECTS/Construct-flow/backend/models/cost_predictor_meta.json)
  * Historical Data Service: [`backend/services/historical_data_service.py`](file:///d:/PROJECTS/Construct-flow/backend/services/historical_data_service.py)
  * API Endpoint: `POST /ai/predict-cost`, `POST /ai/retrain` ([`backend/api/routes/ai.py`](file:///d:/PROJECTS/Construct-flow/backend/api/routes/ai.py))

### 2.1 ඇත්තටම Train වෙනවද? (Is it actually trained or hardcoded?)
* **පිළිතුර:** **ඔව්, මෙය ඇත්තටම Scikit-Learn මඟින් Train වන සැබෑ Machine Learning Pipeline එකකි.**
* **තාක්ෂණය:** `scikit-learn` හි `Pipeline` + `ColumnTransformer` + `RandomForestRegressor`.
* **Hyperparameters:** `n_estimators=100`, `max_depth=12`, `min_samples_leaf=2`, `random_state=42`.
* **පුහුණු වීමේ ස්වභාවය (Cold-Start Calibration):**
  * සැබෑ ලෝකයේ ඉදිකිරීම් අවසන් වූ ව්‍යාපෘති දත්ත (Verified Completed Projects) ප්‍රමාණය දැනට කුඩා බැවින් (දැනට verified projects **3** කි), මොඩලය සකස් කර ඇත්තේ **Parametric Bootstrap (300 calibrated synthetic rows)** සමඟ සැබෑ දත්ත එකතු කර Pre-train වන ආකාරයටයි.
  * මුළු training rows ගණන **303** කි (3 Real + 300 Bootstrap).
  * අලුතින් BOQ හෝ අවසන් වූ ව්‍යාපෘති CSV / Excel ගොනු හරහා Admin Dashboard එකෙන් ඇතුළත් කළ විට, `/ai/retrain` endpoint එක හරහා **ස්වයංක්‍රීයව අලුත් දත්ත මත මොඩලය නැවත Retrain වේ.**

### 2.2 භාවිතා කරන දත්ත සහ Features (Data Types & Features)
Target විචල්‍යය වන්නේ වර්ග අඩියක වියදමේ ස්වභාවික ලඝුගණකයයි:  
$$\text{Target} = \ln\left(\frac{\text{actual\_total\_lkr}}{\text{floor\_area\_sqft}}\right)$$
(අවසන් පුරෝකථනය ලබාගන්නේ $e^{\text{prediction}} \times \text{floor\_area\_sqft}$ සූත්‍රයෙනි).

භාවිතා වන Features 9:
1. **district** (නාමාවලි - Categorical): ශ්‍රී ලංකාවේ දිස්ත්‍රික්ක 25 (One-Hot Encoded).
2. **project_type** (Categorical): Residential House, Commercial Building, Apartment Complex, Industrial, Warehouse, Road Construction, Renovation.
3. **quality_tier** (Categorical): Standard, Premium, Luxury.
4. **structure_type** (Categorical): RCC frame, Steel frame, Pre-engineered, Masonry load bearing.
5. **site_condition** (Categorical): Flat, Sloped, Excavation/Piling.
6. **floors** (සංඛ්‍යාත්මක - Numeric): මහල් ගණන (1 - 100).
7. **floor_area_sqft** (Numeric): ගොඩනැගිල්ලේ වර්ග ප්‍රමාණය (Sq. Ft).
8. **cost_year** (Numeric): ඉදිකිරීම් වර්ෂය (උදා: 2024, 2025, 2026).
9. **price_index** (Numeric): CIDA (Construction Industry Development Authority) බුලටින් මිල දර්ශකය (උද්ධමන උච්චාවචනය සඳහා).

### 2.3 Feature Importance (මොඩලයේ තීරණවලට බලපාන සාධක)
මොඩලය විසින් ගණනය කර Normalize කරන ලද සාධක වැදගත්කම:
* **Project Type (ව්‍යාපෘති වර්ගය):** **49.2%** (ප්‍රධානම සාධකය)
* **Quality Tier (තත්ත්ව මට්ටම):** **46.0%**
* **Floor Area (Sq Ft):** **1.6%** *(මොඩලය වර්ග අඩියක වියදම පුරෝකථනය කරන බැවින් වර්ග ප්‍රමාණය සෘජු feature එකක් ලෙස අඩු බරක් ගනී)*
* **Number of Floors (මහල් ගණන):** **0.9%**
* **Cost Year (මිල කළ වර්ෂය):** **0.7%**
* **Price Index (CIDA Escalation):** **0.7%**
* **District / Location:** **0.6%**
* **Site Condition:** **0.3%**
* **Structure Type:** **0.0%**

### 2.4 නිරවද්‍යතාවය සහ පරීක්ෂණ ක්‍රමවේදය (Accuracy & Provenance)
පද්ධතියේ ඉතා වැදගත් සහ අවංක (Honest Evaluation) ලක්ෂණයක් වන්නේ: **මොඩලයේ නිරවද්‍යතාවය (Accuracy) ගණනය කරනු ලබන්නේ සැබෑ (Real Held-Out) ව්‍යාපෘති මත පමණි.** කෘතිම (Bootstrap) දත්ත නිරවද්‍යතා පරීක්ෂණයට කිසිසේත් ඇතුළත් නොකෙරේ!

* **ඇගයීම් ක්‍රමය (Evaluation Method):** **Leave-One-Out Cross-Validation (LOOCV)** (දත්ත සාම්පල 30 ට අඩු බැවින්).
* **Validation MAPE (Mean Absolute Percentage Error):** **28.34%**  
  *(සාමාන්‍යයෙන් පුරෝකථනය සැබෑ මිලට වඩා ±28.3% ක විචලනයක් පෙන්වයි)*
* **Baseline MAPE (Static Benchmark):** **45.65%**  
  *(සාමාන්‍ය වර්ග අඩියක මිලක් පදනම් කරගත් සරල සූත්‍රයකට වඩා ML මොඩලය බෙහෙවින් දියුණු බව මෙයින් සනාථ වේ: 45.65% සිට 28.34% දක්වා දෝෂය අඩුවී ඇත)*
* **Validation MAE (Mean Absolute Error):** **LKR 49,685,062.98**
* **95% Confidence Interval:** **±31.8% (95% CI: [0.0%, 60.1%])**
* **මොඩලයේ වත්මන් තත්ත්වය (Validation Status):**  
  `"Not enough real projects yet (3 of 30). Estimates use the rate-based baseline / Indicative (n < 100)"`  
  *(පද්ධතිය විසින් පරිශීලකයා මුළා නොකර, සැබෑ ව්‍යාපෘති 30 සම්පූර්ණ වන තුරු මෙය "Indicative" හෙවත් මූලික සංඥාවක් පමණක් බව විවෘතව දක්වයි).*

### 2.5 Hybrid Estimation Approach (ද්විත්ව ඇස්තමේන්තුකරණය)
අවසාන ඇස්තමේන්තුව ලබාදීමේදී පද්ධතිය තනි ML පුරෝකථනයක් පමණක් භාවිත නොකරයි:
$$\text{Final Cost} = (0.70 \times \text{ML Cost}) + (0.30 \times \text{Bottom-Up BOQ Cost})$$
* **Bottom-Up BOQ Calculation:** භෞතික ප්‍රමාණ (සිමෙන්ති කොට්ට, වානේ කිලෝ, වැලි කියුබ්, ගල් කියුබ්, කම්කරු දින - දිනකට රු. 3,500 බැගින්, සහ 15% Overhead) මත පදනම් වූ ඉංජිනේරු ගණනය කිරීමකි.
* තවද ±15% සිට 20% දක්වා අවදානම් පරාසයක් (Prediction Range: Rs. Min to Rs. Max) පරිශීලකයාට ඉදිරිපත් කරයි.

---

## 3. මොඩියුල 2: Project Delay Risk Classifier (ප්‍රමාද අවදානම් විශ්ලේෂකය)

* **ප්‍රධාන ගොනු:**
  * Logic Engine: [`backend/data_pipeline/model_engine.py`](file:///d:/PROJECTS/Construct-flow/backend/data_pipeline/model_engine.py) (`compute_rule_based_delay_risk`)
  * API Route: `GET /ai/insights`, `GET /ai/model-info` ([`backend/api/routes/ai.py`](file:///d:/PROJECTS/Construct-flow/backend/api/routes/ai.py))
  * Legacy Artifacts: `backend/models/delay_classifier.pkl`, `backend/models/delay_classifier_meta.json`

### 3.1 ඇත්තටම Train වෙනවද? Hardcoded ද? (The Truth about Delay Risk)
* **මුල් තත්ත්වය (Legacy):**
  * මුලින් `RandomForestClassifier` එකක් කෘතිම දත්ත 50,000 ක් (`delay_risk_dataset.csv`) මත train කර `delay_classifier.pkl` ලෙස තැන්පත් කර තිබුණි.
  * **එහි නිරවද්‍යතාවය (Accuracy):** **51.22%**  
    *(කාසියක් උඩ දැමූ විට ලැබෙන 50% ට සමාන අගයකි. කෘතිම දත්ත මත පදනම් වූ බැවින් සැබෑ ඉදිකිරීම් බිමක ප්‍රමාදයන් හඳුනා ගැනීමට එය අසමත් විය).*
* **වත්මන් සැබෑ තත්ත්වය:**
  * **අඩු නිරවද්‍යතාවයකින් යුතු Synthetic ML මොඩලය සජීවී නිෂ්පාදනයෙන් (Production) ඉවත් කර ඇත.**
  * ඒ වෙනුවට, ඉදිකිරීම් ක්ෂේත්‍රයේ ප්‍රමිතීන්ට අනුව **100% Rule-Based Deterministic Live Operational Engine** එකක් ක්‍රියාත්මක කර ඇත.
  * එය Hardcoded නියත අගයක් නොවේ; එය සැබෑ Database එකේ ඇති සජීවී ව්‍යාපෘති සංඥා (Live Operational Signals) ගණනය කරන ගතික ඇල්ගොරිතමයකි.

### 3.2 භාවිතා වන සජීවී දත්ත සහ ගණනය කිරීමේ සූත්‍රය (Signals & Formula)
1. **Milestone Overdue Signal (පසුගිය ඉලක්ක ප්‍රමාදය):**
   * කල් ඉකුත් වූ නමුත් තවමත් නිම නොකළ milestones ගණන බලයි.
   * Penalty: එක් ප්‍රමාද milestone එකකට 18% බැගින් (උපරිමය 50%).
2. **Purchase Order Delay Signal (ද්‍රව්‍ය ඇණවුම් ප්‍රමාදය):**
   * Expected date එක පසු වූ, තවමත් නොලැබුණු Purchase Orders ගණන.
   * Penalty: එක් ප්‍රමාද PO එකකට 12% බැගින් (උපරිමය 30%).
3. **Supplier Counter-Offer / Negotiation Gap:**
   * 'Suggested' තත්ත්වයේ ඇති PO සඳහා 5% බැගින් (උපරිමය 15%).
4. **Labour Attendance Signal (සේවක පැමිණීම):**
   * අදාළ කාලය තුළ කිසිදු attendance එකක් වාර්තා වී නොමැති නම් අවදානම ඉහළ නංවයි.
5. **Cost Overrun Forecast (අයවැය ඉක්මවා යාමේ පෙරනිමිති):**
   * $\text{Forecasted Cost} = \frac{\text{Spent Cost}}{(\text{Completion \%} / 100)}$
   * පුරෝකථනය කළ වියදම ව්‍යාපෘති අයවැය ඉක්මවයි නම්, ඉක්මවන ප්‍රතිශතයට සමානුපාතිකව (උපරිම 20% දක්වා) දඩයක් එකතු වේ.
6. **අවසාන අවදානම් ලකුණ (Clamped Risk Score):**
   * සාමාන්‍ය ක්‍රියාකාරී ව්‍යාපෘතියක් සඳහා Base Risk එක 12% කි.
   * ගණනය කරන ලද මුළු අවදානම **5.0% ත් 98.0% ත් අතර** පරාසයකට සීමා (Clamp) කර Project Manager හට Recommendation එකක් සමඟ නිකුත් කෙරේ.

---

## 4. මොඩියුල 3: AI Quotation & BOQ Estimator (Large Language Model)

* **ප්‍රධාන ගොනු:**
  * Controller: [`backend/api/estimator.py`](file:///d:/PROJECTS/Construct-flow/backend/api/estimator.py)
  * Route: `POST /estimator/`

### 4.1 ඇත්තටම Train වෙනවද? (LLM Architecture)
* මෙය අප විසින් Local Train කරන ලද මොඩලයක් නොවේ.
* මෙය **Anthropic සමාගමේ Claude 3.5 Sonnet (`claude-3-5-sonnet-20240620`)** නම් අති නවීන Large Language Model (Foundation Model) එක API මඟින් සෘජුව සම්බන්ධ කර ක්‍රියාත්මක වන Generative AI මොඩියුලයකි.

### 4.2 භාවිතා වන දත්ත සහ ක්‍රියාකාරිත්වය
පරිශීලකයා විසින් ලබාදෙන ව්‍යාපෘති විස්තර:
* Project Name, Project Type, Square Footage, Location, Quality Tier.

පද්ධතිය විසින් Prompt එක තුළට ශ්‍රී ලංකාවේ 2024-2026 වත්මන් ඉදිකිරීම් අමුද්‍රව්‍ය මිල සහ වැටුප් දර්ශක කාවද්දයි (Prompt Engineering with Ground Truth Context):
* සිමෙන්ති: රු. 2,100 / කොට්ටය
* වානේ: රු. 220 / kg
* ගඩොල්: රු. 35 / එකක්
* වැලි: රු. 8,500 / කියුබ්
* ගල්: රු. 7,500 / කියුබ්
* මේසන් බාස්: රු. 3,500 / දිනකට
* වඩු බාස් / විදුලි කාර්මික: රු. 3,000 - 3,500 / දිනකට
* අත්උදව්කරු: රු. 2,000 / දිනකට

Claude 3.5 Sonnet මඟින් සවිස්තරාත්මක JSON ප්‍රතිචාරයක් ලබා දෙයි:
* `material_cost`, `labour_cost`, `equipment_cost`, `overhead`, `total_cost`, `timeline_days`, `confidence_score`, සහ `recommendations`.
* එම දත්ත ස්වයංක්‍රීයව `quotations` table එකට ඇතුළත් වේ.

### 4.3 Dynamic Engineering BOQ Fallback (Hardcoded අගයන් ඉවත් කිරීම)
* **පෙර පැවති තත්ත්වය:** පරිසර විචල්‍යයන් තුළ `ANTHROPIC_API_KEY` සකසා නොමැති විට පෙර පැවතියේ ස්ථාවර Hardcoded Mock එකකි (Total: 22.5M, Material: 15M, Labour: 5M).
* **වත්මන් නව තත්ත්වය:** **Hardcoded Mock ඉවත් කර ඇත.**
  * `ANTHROPIC_API_KEY` නොමැති විටදී පවා, පරිශීලකයා ලබාදෙන වර්ග අඩි ප්‍රමාණය (`req.sq_footage`), තත්ත්ව මට්ටම (`req.quality_tier`), සහ දිස්ත්‍රික්කය අනුව සැබෑ CIDA භෞතික BOQ සූත්‍ර මඟින් (`compute_hybrid_bottom_up`) සිමෙන්ති කොට්ට, වානේ කිලෝ, වැලි කියුබ්, සහ කම්කරු දින ප්‍රමාණය ගණනය කර සජීවීව dynamic estimate එකක් සකස් කෙරේ.
  * වර්ග අඩි 1,000 ක නිවසකට ~රු. මිලියන 11.5 ක් ද, වර්ග අඩි 5,000 කට ~රු. මිලියන 57 ක් ද වශයෙන් සැබෑ ඉංජිනේරු ගණනය කිරීම් අනුව නිවැරදිව ලැබෙන අතර, කිසිදු hardcoded සංඛ්‍යාවක් නැත.

---

## 5. මොඩියුල 4: Frontend Offline Fallbacks & Estimations Predict Updates

* **ප්‍රධාන ගොනු:**
  * [`frontend/src/app/admin/insights.tsx`](file:///d:/PROJECTS/Construct-flow/frontend/src/app/admin/insights.tsx)
  * [`backend/api/routes/estimations.py`](file:///d:/PROJECTS/Construct-flow/backend/api/routes/estimations.py)

### 5.1 Estimations Dummy Regression එක සැබෑ Hybrid ML එකෙන් ආදේශ කිරීම
* පෙර `backend/api/routes/estimations.py` හි `POST /estimations/predict` endpoint එක තුළ hardcoded dummy array එකක් (`X_train = [[1000, 1, 1.0], ...]`, `y_train = [150000, ...]`) මත dummy linear regression එකක් fit කර තිබුණි.
* **එම hardcoded dummy training data සම්පූර්ණයෙන්ම ඉවත් කරන ලදී.** දැන් එම endpoint එක සෘජුවම සැබෑ `predict_cost_hybrid` Random Forest + CIDA engine එක සමඟ සම්බන්ධ කර ඇත.

### 5.2 Frontend Admin Insights හි Fake Data ඉවත් කිරීම
* පෙර `admin/insights.tsx` හි backend offline වූ විට hardcoded fake projects 3ක් (`Colombo Residencies Tower B` ආදී) සහ බොරු නිරවද්‍යතා අගයන් (`validation_mape: 12.4`, `projects: 24`) පෙන්වා තිබුණි.
* **එම සියලු fake hardcoded දත්ත ඉවත් කරන ලදී.**
  * දැන් එය සෘජුවම Supabase හි ඇති සැබෑ `historical_projects` සහ `projects` tables විමසා සැබෑ ව්‍යාපෘති පමණක් පෙන්වයි.
  * Backend ML server එක සම්බන්ධ නැති විට බොරු 12.4% MAPE පෙන්වීම වෙනුවට `validation_mape: null` සහ `"Backend connection required for trained model metrics"` යනුවෙන් අවංක සත්‍ය තත්ත්වය සටහන් කරයි.
  * Market Trends ද සැබෑ completed projects සහ historical BOQs වල දිස්ත්‍රික්ක සහ වර්ගය අනුව dynamically cluster කර පෙන්වයි.

---

## 6. සංසන්දනාත්මක විශ්ලේෂණ සාරාංශය (Summary Matrix)

| මොඩියුලය (Module) | තාක්ෂණය (Technology) | ඇත්තටම Train වෙනවද? | Accuracy / Metric | දත්ත මූලාශ්‍රය (Data Source) | තත්ත්වය (Production Status) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cost Predictor** | Random Forest Regressor (Scikit-Learn) + Hybrid BOQ | **ඔව් (Real Model)** - සැබෑ දත්ත 3 + Bootstrap 300 මත Train වේ. CSV import මඟින් Retrain කළ හැක. | **MAPE: 28.34%**<br>Baseline: 45.65%<br>95% CI: ±31.8% | Verified BOQs, SQLite Cache, CIDA Price Index | **Active (Indicative Mode)**<br>ව්‍යාපෘති 30 සම්පූර්ණ වන තුරු Indicative ලෙස ක්‍රියා කරයි. |
| **Delay Risk Engine** | Rule-Based Deterministic Engine | **නැත (ML ඉවත් කර ඇත)** - මුල් Synthetic RF මොඩලයේ නිරවද්‍යතාව 51.2% ක් වූ නිසා Rule-based කරන ලදී. | Deterministic (100% Audit-proof logic) | Live Milestones, Purchase Orders, Attendance, Overrun Forecast | **Active (Operational)**<br>ව්‍යාපෘති බිමේ සජීවී ගැටළු නිවැරදිව පෙන්වයි. |
| **AI Quotation Generator** | LLM (Anthropic Claude 3.5 Sonnet) + Dynamic BOQ Fallback | **Pre-trained LLM + Dynamic CIDA Engine** | LLM Reasoning & Physical Unit Quantities | Sri Lanka CIDA Market Unit Rates + Project Specs | **Active**<br>API Key ඇති විට Claude AI මඟින්ද, Key නැති විට dynamic CIDA BOQ calculation මඟින්ද ක්‍රියා කරයි. (Hardcoded mocks ඉවත් කර ඇත) |
| **Offline Simulator** | Frontend Logic & Live Supabase Query | **නැත** | Live DB Query | Supabase `projects` සහ `historical_projects` | **Active**<br>සැබෑ දත්ත පමණක් පෙන්වයි. Fake MAPE ඉවත් කර ඇත. |

---

## 7. ශක්තීන් සහ දුර්වලතා (Strengths & Areas for Improvement)

### ශක්තීන් (Strengths):
1. **අවංක සහ විනිවිදභාවයෙන් යුතු ඇගයීම (No Fake Accuracy):** බොරු 95% accuracy සංඛ්‍යා නොපෙන්වා, සැබෑ real projects ප්‍රමාණය කුඩා බවත් (3 of 30), වත්මන් MAPE අගය 28.34% ක් බවත් පද්ධතිය විවෘතව පරිශීලකයාට ප්‍රකාශ කරයි.
2. **Cold-Start ආරක්ෂණය (Hybrid Architecture):** දත්ත නොමැති ආරම්භක අවස්ථාවේදී පද්ධතිය අඩපණ නොවී, 70% ML + 30% ඉංජිනේරු BOQ ප්‍රමාණ එකතු කර ශක්තිමත් ඇස්තමේන්තුවක් ලබා දෙයි.
3. **ස්වයංක්‍රීය Retraining පහසුකම:** පරිපාලකවරයාට නව completed project BOQs (CSV හෝ Excel) upload කළ සැණින් backend එකේ model retraining ස්වයංක්‍රීයව සිදුවේ.
4. **අසාර්ථක Synthetic Delay Model ඉවත් කිරීම:** 51% ක නිරවද්‍යතාවයක් තිබූ බොරු ML model එක වෙනුවට සජීවී ව්‍යාපෘති දත්ත පදනම් කරගත් rule-based එන්ජිමක් ආදේශ කිරීම ඉතා යථාර්ථවාදී සහ නිවැරදි ඉංජිනේරු තීරණයකි.

### ඉදිරි නිර්දේශ (Recommendations):
1. **සැබෑ ව්‍යාපෘති දත්ත එකතු කිරීම (Data Ingestion):** Model එක "Indicative" මට්ටමෙන් මිදී ස්ථාවර "Validated" මට්ටමට පැමිණීමට අවම වශයෙන් සැබෑ අවසන් වූ ව්‍යාපෘති **30 ක්** වත් CSV Import හරහා පද්ධතියට එක් කළ යුතුය.
2. **Delay Risk සඳහා සැබෑ Data එකතු වූ පසු ML නැවත සලකා බැලීම:** සජීවී ව්‍යාපෘති 50 කට වඩා සම්පූර්ණ වී සැබෑ ප්‍රමාද දත්ත එකතු වූ පසු, Logistic Regression හෝ XGBoost මඟින් නැවත Delay Classifier එකක් train කළ හැක.
3. **District Multipliers යාවත්කාලීන කිරීම:** දිස්ත්‍රික්ක 25 හි මිල ගණන් CIDA මාසික දර්ශක සමඟ ස්වයංක්‍රීයව sync වීමට සැලැස්වීම.

---
*වාර්තාව සකස් කළේ Construct-flow Advanced AI & Engineering Architecture කණ්ඩායම විසිනි.*

