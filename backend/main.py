import os
import json
import asyncio
import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

app = FastAPI()

# Allow CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set the path to watch
WATCH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "coda-ep", ".context"))
active_connections = set()

def read_json(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def read_yaml(file_path):
    """Safely reads and parses a YAML file into a Python dictionary."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception:
        return None

def get_full_state():
    """Reads both the active ECS graph and the declarative system flows."""
    return {
        "project_state": read_json(os.path.join(WATCH_DIR, "graph_state.json")),
        "manifesto": read_yaml(os.path.join(WATCH_DIR, "coda_ep_flows.yaml"))
    }

async def broadcast_state():
    """Pushes the updated state to all connected React clients."""
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
    """Listens for file saves and triggers the broadcast."""
    def __init__(self, loop):
        self.loop = loop

    def on_modified(self, event):
        # Update: Listen for JSON changes instead of YAML
        if event.is_directory or not event.src_path.endswith('.json'):
            return
        print(f"🔄 File saved: {event.src_path}. Broadcasting to UI...") 
        asyncio.run_coroutine_threadsafe(broadcast_state(), self.loop)

@app.on_event("startup")
async def startup_event():
    """Starts the Watchdog observer when the server boots."""
    os.makedirs(WATCH_DIR, exist_ok=True)
    
    # Create a dummy JSON file if it doesn't exist so Watchdog/JSON parser doesn't crash
    graph_file = os.path.join(WATCH_DIR, "graph_state.json")
    if not os.path.exists(graph_file):
        with open(graph_file, "w") as f:
            json.dump({"nodes": {}, "edges": {}}, f)

    loop = asyncio.get_running_loop()
    observer = Observer()
    observer.schedule(ContextHandler(loop), path=WATCH_DIR, recursive=False)
    observer.start()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handles the live connection with the React dashboard."""
    await websocket.accept()
    active_connections.add(websocket)
    
    # Instantly send the current state the moment the UI loads
    await websocket.send_json({"type": "STATE_UPDATE", "payload": get_full_state()})
    
    try:
        while True:
            command = await websocket.receive_json()
            print(f"Received command from UI: {command}")
    except WebSocketDisconnect:
        active_connections.remove(websocket)