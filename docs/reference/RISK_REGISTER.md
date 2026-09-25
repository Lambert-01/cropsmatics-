# 18. Risk Register

| Risk | Mitigation |
|---|---|
| Microdata access delay | Use public tables first; design pipeline for later microdata |
| Scope creep | Freeze MVP |
| Facility capacity unavailable | Verified facilities + clearly synthetic demo capacity |
| Causal overclaim | Use association/prediction/scenario wording |
| Survey-weight misuse | Preserve weights; separate survey estimation from ML |
| App bias | Label app data operational/non-representative |
| Weak market data | Keep market module descriptive until verified current data exists |
| Leakage | Time/season-aware validation |
| Connectivity | Expo SQLite offline queue |
| Privacy | Consent, aggregation, RBAC |
| IP-transfer condition | Keep this as a new hackathon-specific standalone project |
