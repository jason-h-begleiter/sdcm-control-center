import os
import re
import json
import yaml
import asyncio
import datetime
import subprocess
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

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

class ScopeRequest(BaseModel):
    intake_file: str

@app.post("/api/v1/epics/scope")
async def trigger_scope(req: ScopeRequest):
    """Hands the baton to the terminal agent to run /pm-scope-epic with the intake document."""
    task_file = os.path.join(WATCH_DIR, "active_task.yaml")
    task_state = {
        "active_flow_id": "EPIC_SCOPING",
        "current_phase": f"/pm-scope-epic '{req.intake_file}'",
        "orchestrator": "human_chat",
        "last_error": None,
        "working_files": [".context/_EPIC_TEMPLATE.yaml", req.intake_file]
    }
    with open(task_file, "w", encoding="utf-8") as f:
        yaml.dump(task_state, f, sort_keys=False)
    return {"status": "started", "task_file": task_file}

@app.post("/api/v1/epics/compile")
async def trigger_compile():
    """Runs the deterministic python script to absorb APPROVED_BY_AUDITOR epics."""
    subprocess.run(["python", "tools/build/compile_epic.py"], check=False)
    return {"status": "compile_triggered"}

@app.get("/api/v1/strategy/export")
async def export_strategy_context():
    """Reads the current architectural state and passes it to the frontend."""
    root_dir = os.path.abspath(os.path.join(WATCH_DIR, ".."))
    claude_md = os.path.join(root_dir, "CLAUDE.md")
    flows_yaml = os.path.join(WATCH_DIR, "coda_ep_flows.yaml")

    payload = ""
    if os.path.exists(claude_md):
        with open(claude_md, "r", encoding="utf-8") as f:
            payload += f"--- CLAUDE.md (Architectural Rules) ---\n{f.read()}\n\n"
    if os.path.exists(flows_yaml):
        with open(flows_yaml, "r", encoding="utf-8") as f:
            payload += f"--- coda_ep_flows.yaml (Current Capabilities) ---\n{f.read()}\n\n"

    return {"context_payload": payload}

@app.get("/api/v1/protocol/diagram")
async def get_protocol_diagram():
    """Dynamically generates a Mermaid diagram from prompt files and system state."""
    root_dir = os.path.abspath(os.path.join(WATCH_DIR, ".."))
    commands_dir = os.path.join(root_dir, ".claude/commands")

    # 1. Base Nodes (The Boundaries)
    mm = "graph TD\n"
    mm += "  subspan[\"<b style='font-size:16px'>Your Brain</b>\"]:::brain\n"
    mm += "  sdcm_ui[\"<b style='font-size:16px'>SDCM UI</b>\"]:::ui\n\n"
    mm += "  subgraph Machine[\"<b style='font-size:16px'>Machine Execution</b>\"]\n"
    mm += "    sub_claude_code[Claude Code / Terminal Agent]:::agent\n"
    mm += "    sub_coda_flows_yaml(coda_ep_flows.yaml):::yaml\n"
    mm += "    sub_active_task(active_task.yaml baton):::yaml\n"
    mm += "    sub_watchdog[Watchdog Observer]:::python\n"
    mm += "    sub_fastapi[FastAPI Backend]:::python\n"
    mm += "  end\n\n"

    # 2. Add Gemini (stateless PM) boundary
    mm += "  subgraph ExternalAI[\"<b style='font-size:16px'>Gemini — Stateless Architect</b>\"]\n"
    mm += "    sub_gemini_brain[Product Discussion]:::brain\n"
    mm += "  end\n\n"

    # 3. Dynamic Workflow Links (UI -> YAML -> Watchdog -> UI)
    mm += "  sdcm_ui --Broadcasting State--> sub_watchdog\n"
    mm += "  sub_watchdog --Detected YAML Write--> sub_coda_flows_yaml\n"

    # 4. Map the Assembly Line Steps

    # Step A: Strategy
    mm += "  subspan --Discussion--> sub_gemini_brain\n"
    mm += "  sub_gemini_brain --Generated Intake Doc--> subspan\n"

    # Step B: Scoping (Pass baton)
    mm += "  subspan --Saves Intake Doc path in UI--> sdcm_ui\n"
    mm += "  sdcm_ui --Triggers /epics/scope--> sub_fastapi\n"
    mm += "  sub_fastapi --Writes baton--> sub_active_task\n"
    mm += "  sub_claude_code --Reads baton--> sub_active_task\n"

    # Step C: Audit (Discover commands)
    if os.path.exists(commands_dir):
        cmds = sorted(f for f in os.listdir(commands_dir) if f.endswith(".md"))
        for cmd_file in cmds:
            cmd_name = cmd_file.replace(".md", "")
            cmd_id = "sub_" + re.sub(r"[^a-zA-Z0-9_]", "_", cmd_name)
            mm += f"  sub_claude_code --Executes--> {cmd_id}({cmd_name}.md):::prompt\n"
            # Special casing visual flow for approval
            if cmd_name == "pm-audit-epic":
                 mm += f"  {cmd_id} --Approval--> subspan\n"

    # Step D: Compile
    mm += "  subspan --Trigger Compile in UI--> sdcm_ui\n"
    mm += "  sdcm_ui --Triggers /epics/compile--> sub_fastapi\n"
    mm += "  sub_fastapi --Executes Python Script--> compile_script[compile_epic.py]:::python\n"
    mm += "  compile_script --Writes Stable Nodes--> sub_coda_flows_yaml\n"

    # 5. Define Styling
    mm += "  classDef brain fill:#0a0a0a,stroke:#4f46e5,stroke-width:2px,color:#fff,rx:10,ry:10;\n"
    mm += "  classDef ui fill:#0a0a0a,stroke:#db2777,stroke-width:2px,color:#fff,rx:10,ry:10;\n"
    mm += "  classDef agent fill:#0a0a0a,stroke:#ca8a04,stroke-width:2px,color:#fff,rx:10,ry:10;\n"
    mm += "  classDef yaml fill:#0a0a0a,stroke:#374151,stroke-width:1px,stroke-dasharray: 5 5,color:#d1d5db;\n"
    mm += "  classDef prompt fill:#0a0a0a,stroke:#374151,stroke-width:1px,color:#9ca3af;\n"
    mm += "  classDef python fill:#0a0a0a,stroke:#10b981,stroke-width:2px,color:#fff,rx:10,ry:10;\n"

    # Transparent subgraph fills so cross-cluster edges remain visible
    mm += "  style Machine fill:transparent,stroke:#404040,stroke-width:1px,stroke-dasharray:4 4,color:#a3a3a3;\n"
    mm += "  style ExternalAI fill:transparent,stroke:#404040,stroke-width:1px,stroke-dasharray:4 4,color:#a3a3a3;\n"

    return {"mermaid_graph": mm}

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