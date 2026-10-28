# Cropmatics — Documentation

**Start here:** [README](README.md) · [Web application](https://cropsmatics-web.vercel.app/dashboard) · [GitHub repository](https://github.com/Lambert-01/cropsmatics-)

Cropmatics is Team DataSprout's entry to NISR 2026 Track 1: Agricultural Productivity. The README is the single project overview. The documents below provide specific supporting evidence rather than competing descriptions of the application.

## 1. NISR submission essentials

1. [Submission requirements and evidence](docs/submission/NISR_WEBINAR_ALIGNMENT.md) — repository, deployment, supporting materials, and recording limit
2. [Data Card](docs/submission/DATA_CARD.md) — sources, periods, dataset coverage, definitions, limitations
3. [Consolidated NISR readiness audit](docs/audits/NISR_2026_FINAL_EXCELLENCE_AUDIT.md) — scientific checks, model boundaries, UX evidence, release status, estimated scoring, remaining tasks
4. [AI development disclosure](docs/20_AI_USAGE_DISCLOSURE.md) — how AI tools assisted development
5. [Data rights and attribution](DATA_LICENSE_AND_PROVENANCE.md) — source-use and redistribution caveats

These five are the recommended reviewer starting points. They do not replace the actual source code, deployed application, demonstration, or official submission form.

## 2. Detailed evidence (open when needed)

- [SAS coverage and source-quality audit](docs/data/SAS_COVERAGE_AUDIT.md)
- [Source precedence decisions](docs/data/SAS_SOURCE_PRECEDENCE.md)
- [Data provenance](docs/DATA_PROVENANCE.md)
- [Number traceability and limitations](docs/submission/DATA_TO_NUMBER_TRACEABILITY.md)
- [Forecast validation](docs/forecasting/FORECAST_VALIDATION.md)
- [Model interpretation policy](docs/MODEL_INTERPRETATION_POLICY.md)
- [AI answer evaluation](docs/submission/AI_EVALUATION.md)
- [Web/mobile UX verification matrix](docs/submission/UX_VERIFICATION.md)
- [Kinyarwanda review status](docs/KINYARWANDA_REVIEW.md)

## 3. Engineering and operations (not required reading for judges)

- [Current implementation status](docs/CURRENT_STATUS.md)
- [Release checklist and production acceptance](docs/PRODUCTION_READINESS.md)
- [Deployment and database authority](docs/17_DEPLOYMENT.md)
- [Testing instructions](docs/16_TESTING.md)
- [API/data-to-UI contract](docs/DATA_TO_UI_MATRIX.md)
- [Mobile navigation and feature flags](docs/MOBILE_INFORMATION_ARCHITECTURE.md)
- [AI architecture](docs/14_AI_ASSISTANT.md)
- [Optimization methodology](docs/13_OPTIMIZATION_ENGINE.md)
- [Security and privacy principles](docs/15_SECURITY_PRIVACY.md)
- [Data sources and processing](data/README.md)
- [Developer scripts](scripts/README.md)

## Scientific validation command

From the repository root, on the chosen release commit:

```bash
make data
make scientific-validation
```

This produces JSON and Markdown reports under `data/interim/`; those generated reports are local release evidence, not seven additional tracked audit documents. Run the same checks on the code/data version intended for submission.

**Documentation policy:** keep the README as the overview, one consolidated submission audit, and authoritative technical/source references. Short outdated page descriptions and duplicate agent-generated audit reports were removed from the active branch. Git history preserves them.
