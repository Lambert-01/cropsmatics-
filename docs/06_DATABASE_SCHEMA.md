# 6. Data Model

## `geo_unit`
province/district/sector codes, names, geometry.

## `crop`
code, English/Kinyarwanda name, category, perishability, cold-chain flag.

## `official_indicator`
source, period, geography, crop, indicator code, value, unit, survey-weight flag, source URL.

## `farm_profile`
Operational platform record: owner, geography, optional GPS, cooperative, consent version.

## `harvest_registration`
crop, expected dates, expected quantity, actual quantity, offline flag, sync state.

## `facility`
name, type, geography, GPS, source, verification status.

## `facility_capacity_snapshot`
facility, timestamp, crop compatibility, total/available capacity.

## `risk_score`
harvest, model version, probability, band, contributing factors.

## `intervention_priority`
geo unit, crop, season, score, gap, readiness, affected scale, constraints.

## `recommendation`
target, type, English/Kinyarwanda text, evidence JSON, acceptance, outcome.

## `audit_log`
actor, action, target, timestamp, metadata.
