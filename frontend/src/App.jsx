import { useEffect, useState, useRef } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Helper function for node types and statuses
const getStatusColor = (status) => {
  switch(status) {
    case 'Active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'Terminated': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'Blocked': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default: return 'bg-neutral-800 text-white border-neutral-700';
  }
}

const getTypeColor = (type) => {
  switch(type) {
    case 'PERSON': return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    case 'ASSET': return 'text-green-400 border-green-500/30 bg-green-500/10';
    case 'DOCUMENT': return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    case 'PROTOCOL': return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    default: return 'text-neutral-400 border-neutral-500/30 bg-neutral-500/10';
  }
}

function App() {
  const [graphState, setGraphState] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const ws = useRef(null)

  useEffect(() => {
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws')
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'STATE_UPDATE' && data.payload.project_state) {
        // Assume main.py now serves the graph_state.json payload under project_state
        setGraphState(data.payload.project_state)
        
        if (!selectedNode && data.payload.project_state.nodes) {
           const firstNode = Object.values(data.payload.project_state.nodes)[0];
           if (firstNode) setSelectedNode(firstNode);
        }
      }
    }
    return () => ws.current.close()
  }, [])

  if (!graphState || !graphState.nodes) return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 font-mono">Connecting to Engine...</div>

  const nodes = Object.values(graphState.nodes);
  const edges = Object.values(graphState.edges || {});

  // Compute incoming and outgoing wires for the selected node
  const incomingEdges = selectedNode ? edges.filter(e => e.target_id === selectedNode.id) : [];
  const outgoingEdges = selectedNode ? edges.filter(e => e.source_id === selectedNode.id) : [];

  return (
    <div className="h-screen bg-neutral-950 text-neutral-300 font-sans flex flex-col overflow-hidden selection:bg-blue-500/30">
      
      {/* ZONE 0: Strategic Graph */}
      <div className="h-48 border-b border-neutral-800 bg-[#050505] relative flex-shrink-0">
        <div className="absolute top-4 left-4 z-10 text-[10px] font-mono text-neutral-500 uppercase tracking-wider bg-neutral-900/80 px-2 py-1 rounded">
          Zone 0: Graph Topology (Active Context)
        </div>
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background color="#171717" gap={16} />
          <Controls showInteractive={false} className="bg-neutral-900 border-neutral-800 fill-white" />
        </ReactFlow>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* ZONE 1: Entity Map (Left Sidebar) */}
        <div className="w-80 border-r border-neutral-800 bg-neutral-900/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h1 className="text-sm font-bold tracking-widest text-neutral-100 uppercase">Engine State</h1>
            <p className="text-xs text-neutral-500 mt-1 font-mono">{nodes.length} Nodes | {edges.length} Edges</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {nodes.map((node) => {
              const identityName = node.components?.Identity?.legal_name || node.id;
              return (
                <button 
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`w-full text-left p-3 rounded-md border transition-all duration-200 ${
                    selectedNode?.id === node.id 
                    ? 'bg-neutral-800 border-neutral-600 shadow-sm' 
                    : 'bg-transparent border-transparent hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm text-neutral-200 truncate pr-2">{identityName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider border ${getTypeColor(node.type)}`}>
                      {node.type}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider border ${getStatusColor(node.status)}`}>
                      {node.status}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ZONE 2: Active Context & Capabilities (Main Stage) */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-y-auto">
          {selectedNode ? (
            <div className="p-8 max-w-4xl">
              <div className="mb-8 border-b border-neutral-800 pb-4">
                <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">
                  {selectedNode.components?.Identity?.legal_name || selectedNode.id}
                </h2>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-1 rounded font-mono uppercase tracking-wider border ${getTypeColor(selectedNode.type)}`}>
                    {selectedNode.type}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded font-mono uppercase tracking-wider border ${getStatusColor(selectedNode.status)}`}>
                    {selectedNode.status}
                  </span>
                </div>
              </div>

              {/* The Periodic Table Components */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {Object.entries(selectedNode.components || {}).map(([compName, compData]) => (
                  <div key={compName} className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-5">
                    <h3 className="text-xs font-mono text-indigo-400 uppercase tracking-wider mb-3">{compName}</h3>
                    <pre className="text-xs text-neutral-300 overflow-x-auto">
                      {JSON.stringify(compData, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>

              {/* Edge/Wire Topology */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <h3 className="text-xs font-mono text-cyan-500 uppercase tracking-wider mb-3">Incoming Wires (Authority over this)</h3>
                  {incomingEdges.length === 0 ? <p className="text-xs text-neutral-600 italic">No incoming capabilities.</p> : incomingEdges.map(edge => (
                    <div key={edge.id} className="bg-neutral-900 border border-neutral-800 rounded-md p-3 mb-2 text-xs font-mono">
                      <span className="text-neutral-500 block mb-1">From: {edge.source_id}</span>
                      {edge.components?.Transmission?.capabilities?.map(cap => (
                        <div key={cap.id} className="text-emerald-400">⚡ {cap.operation}</div>
                      ))}
                      {edge.components?.Logic_Gate && <div className="text-pink-400 mt-1">🔒 Logic Gate Attached</div>}
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="text-xs font-mono text-amber-500 uppercase tracking-wider mb-3">Outgoing Wires (Powers held)</h3>
                  {outgoingEdges.length === 0 ? <p className="text-xs text-neutral-600 italic">No outgoing capabilities.</p> : outgoingEdges.map(edge => (
                    <div key={edge.id} className="bg-neutral-900 border border-neutral-800 rounded-md p-3 mb-2 text-xs font-mono">
                      <span className="text-neutral-500 block mb-1">To: {edge.target_id}</span>
                      {edge.components?.Transmission?.capabilities?.map(cap => (
                        <div key={cap.id} className="text-emerald-400">⚡ {cap.operation}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-600 font-mono text-sm">
              Select a node to inspect physics.
            </div>
          )}
        </div>

        {/* ZONE 3: Pipeline Interlock (Right Sidebar) */}
        <div className="w-80 border-l border-neutral-800 bg-neutral-900/40 p-6 flex flex-col overflow-y-auto">
           <h3 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-6 border-b border-neutral-800 pb-2">Interlock Deck</h3>
           <div className="text-center text-neutral-600 text-xs italic mt-10 font-mono">
             Run '/coda slice review' in terminal to route through the Four Guards.
           </div>
        </div>

      </div>
    </div>
  )
}

export default App