.PHONY: dev backend frontend install install-backend install-frontend clean

BACKEND_DIR := backend
FRONTEND_DIR := frontend
VENV := $(BACKEND_DIR)/.venv
PYTHON := $(VENV)/bin/python
UVICORN := $(VENV)/bin/uvicorn

dev:
	@echo "Starting backend and frontend..."
	@$(MAKE) -j2 backend frontend

backend:
	cd $(BACKEND_DIR) && ../$(VENV)/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

frontend:
	cd $(FRONTEND_DIR) && npm run dev

install: install-backend install-frontend

install-backend:
	test -d $(VENV) || python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r $(BACKEND_DIR)/requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

clean:
	rm -rf $(VENV)
	rm -rf $(FRONTEND_DIR)/node_modules
