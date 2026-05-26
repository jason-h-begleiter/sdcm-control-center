import { useEffect, useState, useRef } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Helper function for status colors
const getStatusColor = (status) => {
  switch(status) {
    case 'STABLE': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'ACTIVE_DEV': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'BACKLOG': return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
    case 'INTEGRATION': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    default: return 'bg-neutral-800 text-white border-neutral-700';
  }
}

// Zone 0: Dummy Data for the Roadmap Graph
const initialNodes = [
  { id: 'stage_1', position: { x: 50, y: 50 }, data: { label: 'MVP Core Features' }, style: { background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '12px', fontWeight: 'bold' } },
  { id: 'stage_2', position: { x: 300, y: 50 }, data: { label: 'Postgres Migration' }, style: { background: '#171717', color: '#737373', border: '1px solid #404040', borderRadius: '8px', padding: '10px 20px', fontSize: '12px' } },
];

const initialEdges = [
  { id: 'e1-2', source: 'stage_1', target: 'stage_2', animated: true, style: { stroke: '#404040' } }
];

function App() {
  const [stateData, setStateData] = useState(null)
  const [selectedComponent, setSelectedComponent] = useState(null)
  const ws = useRef(null)

  useEffect(() => {
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws')
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'STATE_UPDATE' && data.payload.project_state) {
        setStateData(data.payload.project_state)
        if (!selectedComponent) {
           const firstActive = data.payload.project_state.components?.frontend?.find(c => c.status === 'ACTIVE_DEV')
           if (firstActive) setSelectedComponent(firstActive)
        }
      }
    }
    return () => ws.current.close()
  }, [])

  // EARLY RETURN 1: Loading state while waiting for WebSocket
  if (!stateData) return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 font-mono">Connecting to Engine...</div>

  // Flatten components for the sidebar
  const allComponents = []
  if (stateData.components) {
    Object.entries(stateData.components).forEach(([domain, items]) => {
      items.forEach(item => allComponents.push({...item, domain}))
    })
  }

  // MAIN RETURN: The actual UI
  return (
    // Parent wrapper is now a Column (flex-col) to stack Zone 0 on top of the others
    <div className="h-screen bg-neutral-950 text-neutral-300 font-sans flex flex-col overflow-hidden selection:bg-blue-500/30">
      
      {/* ZONE 0: The Strategic Graph (Top Section) */}
      <div className="h-48 border-b border-neutral-800 bg-[#050505] relative flex-shrink-0">
        <div className="absolute top-4 left-4 z-10 text-[10px] font-mono text-neutral-500 uppercase tracking-wider bg-neutral-900/80 px-2 py-1 rounded">
          Zone 0: Project Roadmap
        </div>
        <ReactFlow nodes={initialNodes} edges={initialEdges} fitView>
          <Background color="#171717" gap={16} />
          <Controls showInteractive={false} className="bg-neutral-900 border-neutral-800 fill-white" />
        </ReactFlow>
      </div>

      {/* LOWER STAGE: Zones 1, 2, and 3 sitting side-by-side */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ZONE 1: The Macro State Map (Left Sidebar) */}
        <div className="w-80 border-r border-neutral-800 bg-neutral-900/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h1 className="text-sm font-bold tracking-widest text-neutral-100 uppercase">{stateData.project_name}</h1>
            <p className="text-xs text-neutral-500 mt-1 font-mono">{stateData.current_phase}</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {allComponents.map((comp, idx) => (
              <button 
                key={idx}
                onClick={() => setSelectedComponent(comp)}
                className={`w-full text-left p-3 rounded-md border transition-all duration-200 ${
                  selectedComponent?.name === comp.name 
                  ? 'bg-neutral-800 border-neutral-600 shadow-sm' 
                  : 'bg-transparent border-transparent hover:bg-neutral-800/50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-neutral-200">{comp.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider border ${getStatusColor(comp.status)}`}>
                    {comp.status}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono uppercase">{comp.domain}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ZONE 2: The Active Context (Main Stage) */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-y-auto">
          {selectedComponent ? (
            <div className="p-8 max-w-4xl">
              <div className="mb-8">
                <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">{selectedComponent.name}</h2>
                <span className={`text-xs px-2 py-1 rounded font-mono uppercase tracking-wider border ${getStatusColor(selectedComponent.status)}`}>
                  {selectedComponent.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-5">
                  <h3 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-2">Current State</h3>
                  <p className="text-sm leading-relaxed text-neutral-300">{selectedComponent.current_state}</p>
                </div>
                <div className="bg-blue-950/10 border border-blue-900/30 rounded-lg p-5">
                  <h3 className="text-xs font-mono text-blue-500/70 uppercase tracking-wider mb-2">Goal State</h3>
                  <p className="text-sm leading-relaxed text-blue-100">{selectedComponent.goal_state}</p>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-3">State Transitions (Diffs)</h3>
                {selectedComponent.state_transition && selectedComponent.state_transition.length > 0 ? (
                  <div className="space-y-3">
                    {selectedComponent.state_transition.map((transition, idx) => (
                      <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-md p-4 flex gap-4 items-start">
                        <div className="bg-neutral-800 text-neutral-400 font-mono text-xs px-2 py-1 rounded mt-0.5">
                          {transition.action}
                        </div>
                        <div className="text-sm text-neutral-300 font-mono">
                          {transition.diff}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-neutral-600 italic font-mono bg-neutral-900/50 p-4 rounded-md border border-neutral-800/50">
                    No active transitions. Use /PROPOSE_TRANSITION to generate steps.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-600 font-mono text-sm">
              Select a component to view context.
            </div>
          )}
        </div>

        {/* ZONE 3: The Pipeline Interlock (Right Sidebar) */}
        <div className="w-80 border-l border-neutral-800 bg-neutral-900/40 p-6 flex flex-col overflow-y-auto">
           <h3 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-6 border-b border-neutral-800 pb-2">Interlock Deck</h3>
           
           {!selectedComponent ? (
              <div className="text-center text-neutral-600 text-xs italic mt-10 font-mono">No target acquired.</div>
           ) : (
              <div className="space-y-6">
                
                {/* BACKLOG STATE CONTROLS */}
                {selectedComponent.status === 'BACKLOG' && (
                  <div className="space-y-3">
                    <p className="text-xs text-neutral-400 font-mono mb-2">Phase: Planning</p>
                    <button 
                      onClick={() => console.log("Trigger Propose Transition")}
                      className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono font-bold rounded border border-neutral-600 transition-colors"
                    >
                      [ /PROPOSE_TRANSITION ]
                    </button>
                    <p className="text-[10px] text-neutral-500 leading-tight">
                      Generates the Architect prompt to break the goal state into trackable YAML diffs.
                    </p>
                  </div>
                )}

                {/* ACTIVE_DEV STATE CONTROLS (The Four Guards) */}
                {selectedComponent.status === 'ACTIVE_DEV' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <p className="text-xs text-blue-400 font-mono mb-2">Phase: Implementation</p>
                      <button 
                        onClick={() => console.log("Trigger Generate Increment")}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold rounded shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-colors"
                      >
                        [ /GENERATE_INCREMENT ]
                      </button>
                      <p className="text-[10px] text-neutral-500 leading-tight mb-4">
                        Triggers the Builder agent to write tests and code for active transitions.
                      </p>
                    </div>

                    <div className="border-t border-neutral-800 pt-4 space-y-2">
                      <p className="text-xs text-neutral-500 font-mono mb-2">The Four Guards</p>
                      
                      {/* Guard 1: Deterministic Hooks */}
                      <button className="w-full flex items-center justify-between p-2 bg-neutral-900 border border-neutral-700 rounded hover:border-neutral-500 transition-colors">
                        <span className="text-xs font-mono text-neutral-300">1. Local Hooks</span>
                        <span className="h-2 w-2 rounded-full bg-neutral-600"></span>
                      </button>

                      {/* Guard 2: Test Review */}
                      <button className="w-full flex items-center justify-between p-2 bg-neutral-900 border border-neutral-700 rounded hover:border-neutral-500 transition-colors">
                        <span className="text-xs font-mono text-neutral-300">2. Test Review</span>
                        <span className="h-2 w-2 rounded-full bg-neutral-600"></span>
                      </button>

                      {/* Guard 3: Code Review */}
                      <button className="w-full flex items-center justify-between p-2 bg-neutral-900 border border-neutral-700 rounded hover:border-neutral-500 transition-colors">
                        <span className="text-xs font-mono text-neutral-300">3. Code Review</span>
                        <span className="h-2 w-2 rounded-full bg-neutral-600"></span>
                      </button>

                      {/* Guard 4: MCP / Independent Context */}
                      <button className="w-full flex items-center justify-between p-2 bg-neutral-900 border border-neutral-700 rounded hover:border-neutral-500 transition-colors opacity-50 cursor-not-allowed">
                        <span className="text-xs font-mono text-neutral-300">4. Gemini MCP</span>
                        <span className="text-[9px] text-neutral-500 uppercase">Locked</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* INTEGRATION & STABLE CONTROLS */}
                {(selectedComponent.status === 'INTEGRATION' || selectedComponent.status === 'STABLE') && (
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-400 font-mono mb-2">Phase: Closure</p>
                    <button 
                      disabled={selectedComponent.status === 'STABLE'}
                      className={`w-full py-2.5 text-xs font-mono font-bold rounded transition-colors ${
                        selectedComponent.status === 'STABLE' 
                        ? 'bg-emerald-900/20 text-emerald-700 border border-emerald-900/30 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(5,150,105,0.2)]'
                      }`}
                    >
                      {selectedComponent.status === 'STABLE' ? 'LOCKED (STABLE)' : '[ /RESOLVE_STATE ]'}
                    </button>
                  </div>
                )}

              </div>
           )}
        </div>

      </div>
    </div>
  )
}

export default App