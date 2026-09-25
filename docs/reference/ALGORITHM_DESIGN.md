# 4. Algorithm Design

## 4.1 Productivity Gap Index

For crop `c`, district `d`, season `t`:

\[
PGI_{c,d,t}=100 \times \frac{Y^{benchmark}_{c,t}-Y_{c,d,t}}{Y^{benchmark}_{c,t}}
\]

Benchmarks should be crop/season appropriate and preferably agro-ecologically comparable.

## 4.2 Productivity model

\[
\hat{Y}=f(Area,Rainfall,Seed,Fertilizer,Pesticide,Irrigation,Erosion,Mechanization,Crop,District,Season)
\]

Candidate models:
- linear/regularized regression
- random forest
- gradient boosting
- XGBoost/LightGBM if justified
- hierarchical/mixed models for interpretable geography/crop effects

Validate using later seasons where possible, not only random row splits.

## 4.3 Explainability
Use:
- coefficients
- permutation importance
- SHAP
- partial-dependence plots with caution

**SHAP is not causal inference.**

## 4.4 Intervention Priority Score

Prototype:

\[
IPS_i=w_gG_i+w_vV_i+w_fF_i+w_rR_i-w_cC_i
\]

Where:
- `G`: productivity gap
- `V`: vulnerability/exposure
- `F`: affected farmers/area
- `R`: readiness/infrastructure
- `C`: cost/constraint

Weights must be visible, adjustable, and sensitivity-tested.

## 4.5 Post-harvest risk

\[
PHR_i=P(HighRisk_i\mid X_i)
\]

Possible features:
- crop
- expected volume
- harvest window
- rainfall
- storage practice
- facility distance/capacity
- harvest concentration
- crop perishability
- historical loss measures

For MVP, a transparent rule system plus a calibrated simple classifier is acceptable.

## 4.6 Storage/aggregation optimization

Decision variable:

\[
x_{ij}=\text{kg assigned from harvest source }i\text{ to facility }j
\]

Objective:

\[
\min \sum_{i,j}x_{ij}(\alpha d_{ij}+\beta cost_j+\gamma risk_{ij})
\]

Constraints:

\[
\sum_jx_{ij}\le Q_i
\]

\[
\sum_ix_{ij}\le Capacity_j
\]

\[
x_{ij}\ge0
\]

Add crop compatibility, cold-chain requirement, and maximum travel thresholds.

## 4.7 Recommendation engine
Recommendations must come from validated models, optimizer results, verified rules, and current data. An LLM may explain them in English/Kinyarwanda, but it must not invent numbers.

## 4.8 Feedback loop
Capture actual harvest, actual facility used, quantity stored/lost, selling price, recommendation acceptance, and reason for rejection.
