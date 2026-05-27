import os
import json
import yaml
import asyncio
import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pydantic import BaseModel
import subprocess

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

WATCH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "coda-ep", ".context"))
active_connections = set()

def read_json(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def read_yaml(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception:
        return None

def get_full_state():
    """Reads the static manifesto and volatile test results, merging them in memory."""
    graph_state = read_json(os.path.join(WATCH_DIR, "graph_state.json"))
    manifesto = read_yaml(os.path.join(WATCH_DIR, "coda_ep_flows.yaml"))
    
    test_results_path = os.path.join(WATCH_DIR, "test_results.json")
    test_results = read_json(test_results_path) or {}

    # Grab the exact time the test report was written
    last_test_run = None
    if os.path.exists(test_results_path):
        mtime = os.path.getmtime(test_results_path)
        last_test_run = datetime.datetime.fromtimestamp(mtime).strftime('%b %d, %Y at %I:%M %p')

    # Parse pytest-json-report format into a flat { "test_name": "OUTCOME" } dict
    test_outcomes = {}
    if "tests" in test_results:
        for t in test_results["tests"]:
            name = t.get("nodeid", "").split("::")[-1]
            test_outcomes[name] = t.get("outcome", "unknown").upper()

    # Zip the volatile test state into the static manifesto
    if manifesto and "flows" in manifesto:
        for flow in manifesto["flows"]:
            for verification in flow.get("verifications", []):
                test_name = verification.get("test")
                if test_name in test_outcomes:
                    outcome = test_outcomes[test_name]
                    verification["state"] = "PASS" if outcome == "PASSED" else "FAIL" if outcome == "FAILED" else "TESTING"
                else:
                    verification["state"] = "BACKLOG"

    return {
        "project_state": graph_state,
        "manifesto": manifesto,
        "last_test_run": last_test_run # <-- Add this to the payload
    }

async def broadcast_state():
    if not active_connections:
        return
    state = get_full_state()
    dead_connections = set()
    for connection in active_connections:
        try:
            await connection.send_json({"type": "STATE_UPDATE", "payload": state})
        except Exception:
            dead_connections.add(connection)
    active_connections.difference_update(dead_connections)

class ContextHandler(FileSystemEventHandler):
    def __init__(self, loop):
        self.loop = loop

    def on_modified(self, event):
        if event.is_directory or not (event.src_path.endswith('.json') or event.src_path.endswith('.yaml')):
            return
        print(f"🔄 File saved: {event.src_path}. Broadcasting to UI...") 
        asyncio.run_coroutine_threadsafe(broadcast_state(), self.loop)

class OrchestratorRequest(BaseModel):
    flow_id: str
    action: str

@app.post("/api/v1/orchestrate")
async def trigger_orchestrator(req: OrchestratorRequest):
    """
    Writes the baton file, updates the manifesto status, and triggers a headless agent.
    """
    # 1. Write the baton file
    task_file = os.path.join(WATCH_DIR, "active_task.yaml")
    task_state = {
        "active_flow_id": req.flow_id,
        "current_phase": req.action,
        "orchestrator": "ui_headless",
        "last_error": None,
        "working_files": []
    }
    
    with open(task_file, "w", encoding="utf-8") as f:
        yaml.dump(task_state, f, sort_keys=False)
        
    # 2. Update the manifesto status to ACTIVE_DEV
    manifesto_file = os.path.join(WATCH_DIR, "coda_ep_flows.yaml")
    if os.path.exists(manifesto_file):
        with open(manifesto_file, "r", encoding="utf-8") as f:
            manifesto_data = yaml.safe_load(f)
            
        for flow in manifesto_data.get("flows", []):
            if flow.get("flow_id") == req.flow_id:
                flow["status"] = "ACTIVE_DEV"
                break
                
        with open(manifesto_file, "w", encoding="utf-8") as f:
            yaml.dump(manifesto_data, f, sort_keys=False)
        
    print(f"🚀 Orchestrator took the baton for {req.flow_id} -> {req.action}")
    return {"status": "started", "task_file": task_file}

@app.post("/api/v1/eject")
async def eject_to_terminal():
    """
    The Escape Hatch. Kills headless orchestration and prepares the baton for human chat.
    """
    task_file = os.path.join(WATCH_DIR, "active_task.yaml")
    
    if os.path.exists(task_file):
        with open(task_file, "r", encoding="utf-8") as f:
            task_state = yaml.safe_load(f)
            
        task_state["orchestrator"] = "human_chat"
        
        with open(task_file, "w", encoding="utf-8") as f:
            yaml.dump(task_state, f, sort_keys=False)
            
    print("🛑 Ejected to terminal. Awaiting human input.")
    return {"status": "ejected", "message": "Run /resume in Claude Code"}

@app.on_event("startup")
async def startup_event():
    os.makedirs(WATCH_DIR, exist_ok=True)
    loop = asyncio.get_running_loop()
    observer = Observer()
    observer.schedule(ContextHandler(loop), path=WATCH_DIR, recursive=False)
    observer.start()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    await websocket.send_json({"type": "STATE_UPDATE", "payload": get_full_state()})
    
    try:
        while True:
            command = await websocket.receive_json()
            print(f"Received command from UI: {command}")
    except WebSocketDisconnect:
        active_connections.remove(websocket)