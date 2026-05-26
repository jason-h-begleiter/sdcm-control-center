import os
import yaml
import asyncio
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

# Set the path to watch (assuming the backend is running inside the monorepo)
# For the MVP, we will watch a dummy .context folder at the root of the control center.
WATCH_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".context"))
active_connections = set()

def read_yaml(file_path):
    """Safely reads and parses a YAML file into a Python dictionary."""
    try:
        with open(file_path, "r") as f:
            return yaml.safe_load(f)
    except Exception:
        return None

def get_full_state():
    """Compiles the core SDCM files into a single JSON-ready payload."""
    return {
        "project_state": read_yaml(os.path.join(WATCH_DIR, "project_state.yaml")),
        "topology": read_yaml(os.path.join(WATCH_DIR, "0_Topology.yaml"))
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
        if event.is_directory or not event.src_path.endswith('.yaml'):
            return
        print(f"🔄 File saved: {event.src_path}. Broadcasting to UI...") 
        # File saves can fire multiple rapid events; schedule the update
        asyncio.run_coroutine_threadsafe(broadcast_state(), self.loop)

@app.on_event("startup")
async def startup_event():
    """Starts the Watchdog observer when the server boots."""
    os.makedirs(WATCH_DIR, exist_ok=True)
    
    # Create dummy files if they don't exist yet so Watchdog doesn't crash
    open(os.path.join(WATCH_DIR, "project_state.yaml"), 'a').close()
    open(os.path.join(WATCH_DIR, "0_Topology.yaml"), 'a').close()

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
            # Keep the socket open and listen for UI commands (e.g., Run Guards)
            command = await websocket.receive_json()
            print(f"Received command from UI: {command}")
    except WebSocketDisconnect:
        active_connections.remove(websocket)