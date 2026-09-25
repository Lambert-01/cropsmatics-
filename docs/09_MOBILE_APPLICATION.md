# 9. Mobile — React Native + Expo

## Stack
- Expo
- React Native
- TypeScript
- Expo Router
- TanStack Query
- Expo SQLite
- SecureStore
- optional Expo Location with explicit permission

## Farmer/cooperative mode
1. Language
2. Login
3. Home
4. Farm profile
5. Register harvest
6. Risk result
7. Storage/collection recommendation
8. Market info
9. Alerts
10. Recommendation history
11. Report actual outcome

## Field-officer mode
1. Assigned tasks
2. Farm observation
3. Crop/harvest verification
4. Facility observation
5. Optional photo/GPS
6. Offline sync center

## Offline flow
local UUID → SQLite record → mutation queue → connectivity detected → idempotent API sync → canonical server ID → conflict review where necessary.

## UX
Large tap targets, minimal typing, bilingual text, icons + text for risk, and a visible “Why this recommendation?” panel.
