# Cropmatics Rwanda — developer commands
# Usage: `make help`
.DEFAULT_GOAL := help
SHELL := /bin/bash

API_DIR := services/api
PY := python3
VENV := $(API_DIR)/.venv
PIP := $(VENV)/bin/pip
PYTHON := $(VENV)/bin/python

.PHONY: help
help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---------- setup ----------
.PHONY: install
install: install-js install-api ## Install web+mobile and API dependencies

.PHONY: install-js
install-js: ## Install JS workspaces (web + mobile)
	pnpm install

.PHONY: install-api
install-api: $(VENV)/bin/activate ## Create API venv and install deps

$(VENV)/bin/activate:
	$(PY) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r $(API_DIR)/requirements.txt -r $(API_DIR)/requirements-dev.txt

# ---------- run ----------
.PHONY: api
api: ## Run FastAPI (reload)
	cd $(API_DIR) && .venv/bin/uvicorn app.main:app --reload --port 8000

.PHONY: web
web: ## Run Next.js
	pnpm --filter cropmatics-web dev

.PHONY: mobile
mobile: ## Run Expo
	pnpm --filter cropmatics-mobile start

# ---------- database ----------
.PHONY: db-up
db-up: ## Start PostgreSQL/PostGIS via docker compose
	docker compose up -d db

.PHONY: db-down
db-down: ## Stop docker compose services
	docker compose down

.PHONY: migrate
migrate: ## Apply Alembic migrations
	cd $(API_DIR) && .venv/bin/alembic upgrade head

.PHONY: db-init
db-init: ## Create the database schema from models (dev convenience)
	cd $(API_DIR) && .venv/bin/python -m app.db.init_db

# ---------- quality ----------
.PHONY: lint
lint: ## Lint JS + Python (including the data pipeline)
	pnpm -r --if-present lint
	cd $(API_DIR) && .venv/bin/ruff check app tests
	$(VENV)/bin/ruff check scripts/data scripts/tests

.PHONY: format
format: ## Format Python
	cd $(API_DIR) && .venv/bin/ruff format app tests

.PHONY: typecheck
typecheck: ## Typecheck JS/TS
	pnpm -r --if-present typecheck

.PHONY: test
test: test-api test-data test-ml ## Run backend + data pipeline + ML tests

.PHONY: test-api
test-api: ## Run API tests
	$(VENV)/bin/pytest services/api/tests -q

.PHONY: test-data
test-data: ## Run data pipeline tests (requires `make data` first)
	$(VENV)/bin/pytest scripts/tests -q

.PHONY: test-ml
test-ml: ## Run ML tests
	$(VENV)/bin/pytest ml -q

# ---------- data / ML ----------
.PHONY: data
data: ## Run the full data pipeline (validate → normalize → build)
	$(PY) scripts/data/run_all.py

.PHONY: data-validate
data-validate: ## Validate raw datasets only
	$(PY) scripts/data/validate_raw.py

.PHONY: ml
ml: ## Build training dataset + baseline model metrics
	$(PY) ml/src/pipelines/run_training.py
