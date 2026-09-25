# 3. System Architecture

```mermaid
flowchart LR
  A[NISR SAS / official tables] --> E[ETL + Harmonization]
  B[Weather/climate] --> E
  C[Facilities/roads/markets] --> E
  D[Expo mobile operational signals] --> E

  E --> DB[(PostgreSQL + PostGIS)]
  DB --> P[Productivity Engine]
  DB --> R[Post-Harvest Risk]
  DB --> I[Intervention Priority]
  DB --> O[Storage Optimizer]

  P --> API[FastAPI]
  R --> API
  I --> API
  O --> API
  DB --> API

  API --> WEB[Next.js Dashboard]
  API --> MOB[Expo React Native App]
  MOB --> API
  WEB --> API
```

## Separate data layers
1. **Official statistical baseline**
2. **Operational app data**
3. **External open data**

Never label voluntary app data as nationally representative statistics.
