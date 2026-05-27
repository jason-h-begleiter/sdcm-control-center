import { useEffect, useState, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background: '#0a0a0a',
    primaryColor: '#0a0a0a',
    primaryTextColor: '#e5e5e5',
    primaryBorderColor: '#4f46e5',
    lineColor: '#737373',
    edgeLabelBackground: '#171717',
    tertiaryColor: 'transparent',
    clusterBkg: 'transparent',
    clusterBorder: '#404040',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  flowchart: { curve: 'basis', htmlLabels: true, padding: 16, nodeSpacing: 40, rankSpacing: 60 },
  securityLevel: 'loose',
});

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
  const [activeTab, setActiveTab] = useState('protocol')
  const [intakePath, setIntakePath] = useState('')
  const [protocolDiagram, setProtocolDiagram] = useState('')
  const ws = useRef(null)
  const protocolRef = useRef(null)

  const handleCopyCommand = async (command) => {
    try {
      await navigator.clipboard.writeText(command);
      console.log(`Copied to clipboard: ${command}`);
    } catch (err) {
      console.error('Failed to copy command', err);
    }
  };

  const handleScopeEpic = async () => {
    if (!intakePath) return;
    try {
      await fetch('http://127.0.0.1:8000/api/v1/epics/scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intake_file: intakePath })
      });
      setIntakePath('');
      alert("Intake document passed! Open your terminal and run '/resume'.");
    } catch (err) {
      console.error('Failed to trigger scope', err);
    }
  };

  const handleCompileEpics = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/v1/epics/compile', { method: 'POST' });
    } catch (err) {
      console.error('Failed to trigger compile', err);
    }
  };

  const handleExportStrategy = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/strategy/export');
      const data = await res.json();

      const geminiPrompt = `You are my stateless Strategic Product Manager/Architect.
We will debate business logic, map subrepo boundaries, and flag privacy risks.

OUTPUT CONTRACT: When we agree on a scope, you MUST output a markdown document formatted exactly to match the \`.context/_INTAKE_TEMPLATE.md\` structure. It must explicitly state domains touched, downstream dependencies, and where \`assert_no_financial_pii\` is required. Do not write application code.

Here is the current state of my machine:

=== CURRENT SYSTEM CONTEXT ===
${data.context_payload}`;

      await navigator.clipboard.writeText(geminiPrompt);
      alert("Strategic prompt and system state copied! Paste it into Gemini.");
    } catch (err) {
      console.error('Failed to export strategy context', err);
    }
  };

  const handleOrchestrate = async (flowId, action) => {
    try {
      await fetch('http://127.0.0.1:8000/api/v1/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: flowId, action: action })
      });
    } catch (err) {
      console.error('Failed to trigger orchestrator', err);
    }
  };

  const handleEject = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/v1/eject', { method: 'POST' });
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

  useEffect(() => {
    if (activeTab !== 'protocol') return;
    let cancelled = false;
    fetch('http://127.0.0.1:8000/api/v1/protocol/diagram')
      .then(res => res.json())
      .then(data => { if (!cancelled) setProtocolDiagram(data.mermaid_graph); })
      .catch(err => console.error('Failed to fetch protocol diagram', err));
    return () => { cancelled = true; };
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'protocol' || !protocolDiagram) return;
    let cancelled = false;
    const renderId = `protocol-mermaid-${Date.now()}`;
    mermaid.render(renderId, protocolDiagram)
      .then(({ svg }) => {
        if (!cancelled && protocolRef.current) protocolRef.current.innerHTML = svg;
      })
      .catch(err => {
        console.error('mermaid render failed', err);
        if (!cancelled && protocolRef.current) {
          protocolRef.current.innerHTML = `<pre class="text-[10px] text-red-400 whitespace-pre-wrap text-left">${String(err?.message || err)}</pre>`;
        }
      });
    return () => { cancelled = true; };
  }, [protocolDiagram, activeTab])

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
        <div className="flex gap-8 items-end justify-between">
          <div className="flex gap-8 flex-1">
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
          <div className="flex gap-2 bg-neutral-900 p-1 rounded-md border border-neutral-800">
            <button
              onClick={() => setActiveTab('protocol')}
              className={`px-4 py-1.5 text-xs font-mono rounded ${activeTab === 'protocol' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              System Protocol Hub
            </button>
            <button
              onClick={() => setActiveTab('strategy')}
              className={`px-4 py-1.5 text-xs font-mono rounded ${activeTab === 'strategy' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              Roadmap Strategy
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-1.5 text-xs font-mono rounded ${activeTab === 'library' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              Operations Library
            </button>
            <button
              onClick={() => setActiveTab('epic')}
              className={`px-4 py-1.5 text-xs font-mono rounded ${activeTab === 'epic' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              Epic Board
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'library' ? (
          <>
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
                    <div className="flex items-center gap-3">
                      <span>Required Verifications</span>
                      {selectedFlow.verifications?.length > 1 && (
                        <button
                          onClick={() => {
                            const testNames = selectedFlow.verifications.map(v => v.test).join(" or ");
                            handleCopyCommand(`uv run pytest ${selectedFlow.domain}/tests/ -k "${testNames}" --json-report --json-report-file=.context/test_results.json`);
                          }}
                          className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-600 transition-colors cursor-pointer"
                          title="Run all verifications for this flow at once"
                        >
                          [ Run All ]
                        </button>
                      )}
                    </div>
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
        </>
        ) : activeTab === 'protocol' ? (
          /* ZONE 6: System Protocol Hub */
          <div className="flex-1 p-8 overflow-y-auto bg-[#0a0a0a] flex gap-8">
             {/* Dynamic Mermaid Diagram */}
             <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl">
               <h2 className="text-sm font-bold text-white mb-6 font-mono uppercase tracking-wider">Dynamic Execution Topology</h2>
               <div ref={protocolRef} className="text-center overflow-auto [&_svg]:mx-auto [&_svg]:max-w-full" />
               {!protocolDiagram && (
                 <div className="text-center text-neutral-600 font-mono text-xs italic mt-10">Loading topology...</div>
               )}
             </div>

             {/* System Laws panel (Right) */}
             <div className="w-[450px] bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 font-mono">
                <h3 className="text-xs text-neutral-500 mb-2 uppercase tracking-widest">Architectural Laws (CLAUDE.md)</h3>
                <pre className="text-[10px] text-neutral-300 whitespace-pre-wrap leading-relaxed">
                   - State-Driven Context Management (SDCM): Information is State.
                   - Strict Defense-in-Depth for PII and Fin-PII.
                   - STRICT_NO_LLM_NUMERICS.
                   - Unified umbrella root test execution (uv run pytest).
                   - Bounded Flows. The machine drafts; the user decides.
                </pre>
             </div>
          </div>
        ) : activeTab === 'strategy' ? (
          /* ZONE 5: Roadmap Strategy */
          <div className="flex-1 p-8 overflow-y-auto bg-[#0a0a0a]">
             <h2 className="text-xl font-bold font-mono text-white mb-6 uppercase tracking-widest">Roadmap & Strategy Session</h2>
             <div className="max-w-2xl bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 shadow-sm">
                <h3 className="text-sm font-bold text-indigo-400 mb-2 font-mono uppercase">Step 0: The State Transfer</h3>
                <p className="text-xs text-neutral-400 mb-6 font-mono leading-relaxed">
                  To scope features effectively, external AI models (like Gemini) need to know your architectural laws and current execution graph. Click below to bundle your local state and the strict output contract into your clipboard.
                </p>
                <button
                  onClick={handleExportStrategy}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono uppercase tracking-widest font-bold rounded transition-colors shadow-[0_0_15px_rgba(79,70,229,0.2)]"
                >
                  [ Copy State & Prompt for Gemini ]
                </button>

                <div className="mt-6 pt-6 border-t border-neutral-800 text-[10px] text-neutral-500 font-mono">
                  <p>1. Paste the clipboard contents into Gemini to initialize the session.</p>
                  <p>2. Discuss your roadmap feature.</p>
                  <p>3. Copy Gemini's output into a <code className="text-neutral-300">docs/epics/intake/*.md</code> file.</p>
                  <p>4. Move to the <strong>Epic Board</strong> tab to compile it.</p>
                </div>
             </div>
          </div>
        ) : (
          /* ZONE 4: Epic Board (Kanban / Dependency Graph) */
          <div className="flex-1 p-8 overflow-y-auto bg-[#0a0a0a]">
             <h2 className="text-xl font-bold font-mono text-white mb-4 uppercase tracking-widest">Epic Board & Execution Graph</h2>

             {/* Intake & Action Bar */}
             <div className="mb-8 p-4 bg-neutral-900/80 border border-neutral-800 rounded-lg shadow-sm">
                <p className="text-xs font-mono text-neutral-400 mb-3">
                  <span className="text-indigo-400 font-bold uppercase tracking-wider">Step 1: Ideation —</span> Copy <code className="text-neutral-200 bg-black px-1.5 py-0.5 rounded border border-neutral-800">.context/_INTAKE_TEMPLATE.md</code> to a new file in <code className="text-neutral-200 bg-black px-1.5 py-0.5 rounded border border-neutral-800">docs/epics/intake/</code> and fill it out.
                </p>
                <div className="flex gap-4">
                  <div className="flex flex-1 bg-[#050505] border border-neutral-700 rounded overflow-hidden focus-within:border-indigo-500 transition-colors">
                    <input
                      type="text"
                      value={intakePath}
                      onChange={(e) => setIntakePath(e.target.value)}
                      placeholder="docs/epics/intake/my-feature.md"
                      className="bg-transparent text-xs font-mono text-white px-4 py-2 w-full focus:outline-none placeholder:text-neutral-600"
                    />
                    <button onClick={handleScopeEpic} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono uppercase tracking-widest font-bold transition-colors whitespace-nowrap">
                      [ Step 2: Scope Epic ]
                    </button>
                  </div>
                  <button onClick={handleCompileEpics} className="px-5 py-2 bg-emerald-900/40 border border-emerald-700/50 hover:bg-emerald-800/60 text-emerald-400 text-[10px] font-mono uppercase tracking-widest font-bold rounded transition-colors shadow-[0_0_10px_rgba(16,185,129,0.1)] whitespace-nowrap">
                    [ Step 3: Compile Approved ]
                  </button>
                </div>
             </div>
             <div className="flex gap-6 overflow-x-auto pb-4">
               {['BACKLOG', 'ACTIVE_DEV', 'TESTING', 'STABLE', 'FAIL'].map(statusCol => (
                 <div key={statusCol} className="w-80 flex-shrink-0 flex flex-col bg-neutral-900/40 rounded-lg border border-neutral-800 p-4">
                   <h3 className={`text-xs font-mono uppercase tracking-wider mb-4 border-b border-neutral-800 pb-2 ${getStatusColor(statusCol)}`}>
                     {statusCol} ({flows.filter(f => f.status === statusCol).length})
                   </h3>
                   <div className="space-y-3 flex-1 overflow-y-auto">
                     {flows.filter(f => f.status === statusCol).map(flow => {
                       const dependencies = flow.depends_on || [];
                       const blockedBy = dependencies.filter(depId => {
                         const depFlow = flows.find(f => f.flow_id === depId);
                         return depFlow && depFlow.status !== 'STABLE';
                       });
                       const isBlocked = blockedBy.length > 0;

                       return (
                         <div key={flow.flow_id} className={`p-3 rounded border bg-neutral-900 ${isBlocked ? 'border-red-900/50 opacity-75' : 'border-neutral-700'}`}>
                           <div className="flex justify-between items-start mb-2">
                             <span className="text-xs font-mono text-neutral-200">{flow.flow_id}</span>
                             <span className="text-[9px] text-neutral-500 font-mono px-1 border border-neutral-700 rounded">{flow.epic_id || 'NO-EPIC'}</span>
                           </div>
                           {dependencies.length > 0 && (
                             <div className="mt-2 text-[10px] font-mono">
                               <span className="text-neutral-500">Depends on: </span>
                               {dependencies.map(dep => (
                                 <span key={dep} className={`${blockedBy.includes(dep) ? 'text-red-400' : 'text-emerald-400'} mr-1`}>[{dep}]</span>
                               ))}
                             </div>
                           )}
                         </div>
                       )
                     })}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App