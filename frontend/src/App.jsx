import { useEffect, useState, useRef } from 'react'

// Status coloring helpers
const getStatusColor = (status) => {
  switch(status) {
    case 'STABLE': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    case 'PASS': return 'text-emerald-400';
    case 'ACTIVE_DEV': return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    case 'TESTING': return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    case 'FAIL': return 'text-red-400';
    case 'BACKLOG': return 'text-neutral-400 border-neutral-500/30 bg-neutral-500/10';
    default: return 'text-neutral-400 border-neutral-500/30 bg-neutral-500/10';
  }
}

function App() {
  const [graphState, setGraphState] = useState(null)
  const [manifesto, setManifesto] = useState(null)
  const [selectedFlowId, setSelectedFlowId] = useState(null)
  const [lastTestRun, setLastTestRun] = useState(null)
  const ws = useRef(null)

  const handleCopyCommand = async (command) => {
    try {
      await navigator.clipboard.writeText(command);
      console.log(`Copied to clipboard: ${command}`);
    } catch (err) {
      console.error('Failed to copy command', err);
    }
  };

  const handleOrchestrate = async (flowId, action) => {
    try {
      await fetch('http://127.0.0.1:8000/api/v1/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: flowId, action: action })
      });
      // The backend writing the YAML will trigger Watchdog and update the UI automatically
    } catch (err) {
      console.error('Failed to trigger orchestrator', err);
    }
  };

  const handleEject = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/v1/eject', { method: 'POST' });
      // Notify the user to switch to the terminal
      alert("Ejected! Open your terminal and type '/resume'");
    } catch (err) {
      console.error('Failed to eject', err);
    }
  };

  useEffect(() => {
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws')
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'STATE_UPDATE') {
        if (data.payload.project_state) setGraphState(data.payload.project_state);
        if (data.payload.last_test_run) setLastTestRun(data.payload.last_test_run); 
        
        if (data.payload.manifesto) {
          setManifesto(data.payload.manifesto);
          if (!selectedFlowId && data.payload.manifesto.flows?.length > 0) {
            setSelectedFlowId(data.payload.manifesto.flows[0].flow_id);
          }
        }
      }
    }
    return () => ws.current.close()
  }, [selectedFlowId])

  if (!manifesto) {
    return <div className="h-screen bg-neutral-950 flex items-center justify-center text-neutral-500 font-mono">Loading System Manifesto...</div>
  }

  const flows = manifesto.flows || [];
  const selectedFlow = flows.find(f => f.flow_id === selectedFlowId) || flows[0];

  // Group flows by domain for the sidebar
  const domains = [...new Set(flows.map(f => f.domain))];

  return (
    <div className="h-screen bg-neutral-950 text-neutral-300 font-sans flex flex-col overflow-hidden selection:bg-blue-500/30">
      
      {/* ZONE 0: Global Strategic Overview */}
      <div className="h-32 border-b border-neutral-800 bg-[#050505] p-6 flex-shrink-0 flex flex-col justify-center">
        <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
          SDCM-0: System Capability Manifesto — Global Health
        </div>
        <div className="flex gap-8">
          {domains.map(domain => {
            const domainFlows = flows.filter(f => f.domain === domain);
            const stableCount = domainFlows.filter(f => f.status === 'STABLE').length;
            const progress = Math.round((stableCount / domainFlows.length) * 100) || 0;
            return (
              <div key={domain} className="flex-1 max-w-xs">
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-neutral-300 uppercase">{domain} Pipelines</span>
                  <span className={progress === 100 ? 'text-emerald-400' : 'text-amber-400'}>{progress}%</span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="text-[10px] text-neutral-500 font-mono mt-1">
                  {stableCount}/{domainFlows.length} Flows STABLE
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* ZONE 1: Operations Library (Left Sidebar) */}
        <div className="w-80 border-r border-neutral-800 bg-neutral-900/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h1 className="text-sm font-bold tracking-widest text-neutral-100 uppercase">Operations Library</h1>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {domains.map(domain => (
              <div key={domain}>
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2 border-b border-neutral-800 pb-1">
                  ▼ {domain}
                </div>
                <div className="space-y-1">
                  {flows.filter(f => f.domain === domain).map(flow => (
                    <button 
                      key={flow.flow_id}
                      onClick={() => setSelectedFlowId(flow.flow_id)}
                      className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 flex items-center justify-between ${
                        selectedFlow?.flow_id === flow.flow_id 
                        ? 'bg-neutral-800 shadow-sm' 
                        : 'bg-transparent hover:bg-neutral-800/50'
                      }`}
                    >
                      <span className="font-mono text-xs text-neutral-300 truncate pr-2">
                        {flow.flow_id}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider border ${getStatusColor(flow.status)}`}>
                        {flow.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ZONE 2: Operation Details (Main Stage) */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-y-auto">
          {selectedFlow ? (
            <div className="p-8 max-w-3xl">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-white tracking-tight font-mono">{selectedFlow.flow_id}</h2>
                  <span className={`text-xs px-2 py-1 rounded font-mono uppercase tracking-wider border ${getStatusColor(selectedFlow.status)}`}>
                    {selectedFlow.status}
                  </span>
                </div>
                <p className="text-sm text-neutral-400">{selectedFlow.description}</p>
              </div>

              <div className="space-y-6 font-mono text-xs">
                {/* INPUTS */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                  <h3 className="text-indigo-400 uppercase tracking-wider mb-3">Inputs</h3>
                  <ul className="space-y-2">
                    {selectedFlow.inputs?.map((input, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-neutral-500">└─</span>
                        <span className="text-neutral-300">[{input.type}] {input.format || input.blueprint_id}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* GUARDS */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                  <h3 className="text-amber-500 uppercase tracking-wider mb-3">Required Guards (Defense-in-Depth)</h3>
                  {selectedFlow.guards?.length === 0 ? <p className="text-neutral-600 italic">No explicit pre-guards defined.</p> : (
                    <ul className="space-y-2">
                      {selectedFlow.guards?.map((guard, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-neutral-500">└─</span>
                          <span className="text-amber-100 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{guard}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* PROCESSES */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                  <h3 className="text-cyan-500 uppercase tracking-wider mb-3">Processes</h3>
                  <ul className="space-y-2">
                    {selectedFlow.processes?.map((proc, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-neutral-500">└─</span>
                        <span className="text-cyan-100">{proc.agent || proc.system}</span>
                        {(proc.constraints || proc.condition) && (
                          <span className="text-neutral-500 italic">({proc.constraints || proc.condition})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* OUTPUTS */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                  <h3 className="text-emerald-500 uppercase tracking-wider mb-3">Outputs</h3>
                  <ul className="space-y-2">
                    {selectedFlow.outputs?.map((out, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-neutral-500">└─</span>
                        <span className="text-emerald-100">
                          {out.entity ? `[Entity: ${out.entity}]` : `[Event: ${out.event}]`}
                        </span>
                        {out.statement_type && <span className="text-neutral-500">({out.statement_type})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-600 font-mono text-sm">
              Select a flow to inspect parameters.
            </div>
          )}
        </div>

        {/* ZONE 3: Pipeline Interlock (Right Sidebar) */}
        <div className="w-[340px] border-l border-neutral-800 bg-neutral-900/40 p-6 flex flex-col overflow-y-auto">
           <h3 className="text-xs font-mono text-neutral-500 uppercase tracking-wider mb-6 border-b border-neutral-800 pb-2">Pipeline Interlock & TDD Guard</h3>
           
           {selectedFlow ? (
             <div className="space-y-6">
                
                {/* TDD Verifications */}
                <div>
                <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mb-3 flex justify-between items-center">
                    <span>Required Verifications</span>
                    {lastTestRun && (
                      <span className="text-neutral-500 lowercase tracking-normal">
                        (Last run: {lastTestRun})
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {selectedFlow.verifications?.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => handleCopyCommand(`uv run pytest ${selectedFlow.domain}/tests/ -k "${v.test}" --json-report --json-report-file=.context/test_results.json`)}
                        className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-800/50 rounded p-2 flex items-start gap-2 transition-all cursor-pointer group shadow-sm"
                        title="Copy pytest command"
                      >
                        <span className={`text-[10px] mt-0.5 flex-shrink-0 ${getStatusColor(v.state)}`}>
                          {v.state === 'PASS' ? '✅' : '❌'}
                        </span>
                        <div className="flex-1 overflow-hidden">
                          <div className="text-[10px] font-mono text-neutral-300 break-all leading-tight group-hover:text-indigo-300 transition-colors">
                            {v.test}
                          </div>
                          <div className="text-[8px] text-neutral-500 font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            [ Click to copy test command ]
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-neutral-800 pt-6">
                  <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mb-3">Development Controls</div>

                  {/* Context-aware buttons based on your Archive.zip workflows */}
                  {selectedFlow.status === 'BACKLOG' && (
                    <button
                      onClick={() => handleOrchestrate(selectedFlow.flow_id, 'GENERATE_INCREMENT')}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded transition-colors shadow-[0_0_15px_rgba(79,70,229,0.2)]"
                    >
                      Run Headless: [ GENERATE_INCREMENT ]
                    </button>
                  )}

                  {selectedFlow.status === 'ACTIVE_DEV' && (
                    <div className="space-y-2">
                      <button
                        onClick={() => handleCopyCommand(`@test-reviewer Review the tests for ${selectedFlow.flow_id}`)}
                        className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono font-bold rounded border border-neutral-600 transition-colors"
                      >
                        Copy @test-reviewer prompt
                      </button>
                      <button
                        onClick={() => handleCopyCommand(`@code-reviewer Review implementation for ${selectedFlow.flow_id}`)}
                        className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono rounded border border-neutral-600 transition-colors"
                      >
                        Copy @code-reviewer
                      </button>
                      <button
                        onClick={() => handleCopyCommand(`Run the /adversarial-review skill for ${selectedFlow.flow_id}.`)}
                        className="w-full py-2 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 text-xs font-mono rounded border border-indigo-700/50 transition-colors shadow-[0_0_10px_rgba(79,70,229,0.1)]"
                      >
                        Copy Gemini MCP Audit
                      </button>

                      {/* Post-Merge Wrap Up */}
                      <div className="pt-4 mt-4 border-t border-neutral-800/50">
                        <div className="text-[9px] text-amber-500/70 uppercase tracking-wider mb-2 text-center">
                          Post-Merge Action
                        </div>
                        <button
                          onClick={() => handleCopyCommand(`/pm-finalize ${selectedFlow.flow_id}`)}
                          className="w-full py-2 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 text-xs font-mono rounded border border-emerald-800/50 transition-colors"
                          title="Run only after audits pass and PR is merged"
                        >
                          [ /pm-finalize ] (Audits Clear)
                        </button>
                      </div>
                    </div>
                  )}

                  {(selectedFlow.status === 'STABLE' || selectedFlow.status === 'INTEGRATION') && (
                    <div className="space-y-2">
                      {/* Using your existing coda-pm workflows */}
                      <button
                        onClick={() => handleCopyCommand(`/pm-finalize ${selectedFlow.flow_id}`)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold rounded transition-colors shadow-[0_0_15px_rgba(5,150,105,0.2)]"
                      >
                        [ /pm-finalize ]
                      </button>
                      <button
                        onClick={() => handleCopyCommand(`/pm-plan-next`)}
                        className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-mono rounded border border-neutral-600 transition-colors"
                      >
                        [ /pm-plan-next ]
                      </button>
                    </div>
                  )}

                  {/* The universal escape hatch */}
                  <button
                    onClick={handleEject}
                    className="w-full py-2 mt-6 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/50 text-[10px] font-mono font-bold rounded transition-colors uppercase tracking-widest"
                  >
                    [ Eject to Terminal ]
                  </button>
                </div>

             </div>
           ) : (
             <div className="text-center text-neutral-600 text-xs italic mt-10 font-mono">No flow selected.</div>
           )}
        </div>

      </div>
    </div>
  )
}

export default App