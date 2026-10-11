"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, Check, CircleHelp, CornerDownRight, Play, RotateCcw, Sparkles, Workflow } from 'lucide-react';

const nodes = [
  { id: 'api', number: '01', title: 'API Development', owner: 'Maya Patel', initial: 'IN PROGRESS' },
  { id: 'integration', number: '02', title: 'Integration Testing', owner: 'Noah Chen', initial: 'READY' },
  { id: 'qa', number: '03', title: 'QA Validation', owner: 'Sam Rivera', initial: 'READY' },
  { id: 'release', number: '04', title: 'Release Readiness', owner: 'Sam Rivera', initial: 'READY' },
  { id: 'docs', number: '05', title: 'Documentation', owner: 'API contract · Noah Chen', initial: 'READY' },
];

const generationSteps = [
  'Parsing the goal',
  'Identifying tasks',
  'Connecting dependencies',
  'Evaluating team capacity',
  'Preparing a reviewable plan',
];

const sampleTasks = [
  { task: 'API Development', owner: 'Maya Patel', date: 'Tue · 13 Oct', depends: 'Friday release goal' },
  { task: 'Integration Testing', owner: 'Noah Chen', date: 'Thu · 15 Oct', depends: 'API Development' },
  { task: 'QA Validation', owner: 'Sam Rivera', date: 'Thu · 15 Oct', depends: 'Integration Testing' },
  { task: 'Documentation', owner: 'Noah Chen', date: 'Wed · 14 Oct', depends: 'API Integration' },
  { task: 'Release Readiness', owner: 'Sam Rivera', date: 'Fri · 16 Oct', depends: 'QA + Documentation' },
];

export function DominoSimulator() {
  const [blocked, setBlocked] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const focusedNode = nodes.find((node) => node.id === focusedNodeId);

  return (
    <div className="domino-layout">
      <div className="graph-panel reveal">
        <div className="graph-panel-head">
          <div><span className="overline">DEPENDENCY MAP · SAMPLE DATA</span><p>Release path <span>·</span> 5 connected tasks</p></div>
          <span className={`graph-status ${blocked ? 'graph-status--alert' : ''}`}><i />{blocked ? 'IMPACT DETECTED' : 'PATH INTACT'}</span>
        </div>
        <div className={`graph-canvas${blocked ? ' graph-canvas--blocked' : ''}`}>
          <svg className="graph-lines" viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
            <path className="graph-link" d="M235 67 H265" markerEnd="url(#graph-arrow)" />
            <path className="graph-link" d="M485 67 H515" markerEnd="url(#graph-arrow)" />
            <path className="graph-link" d="M735 67 H765" markerEnd="url(#graph-arrow)" />
            <path className="graph-link graph-link--branch" d="M125 103 C160 157 459 140 515 185" markerEnd="url(#graph-arrow)" />
          </svg>
          <div className="graph-nodes" role="list" aria-label="Friday product release dependency graph">
            {nodes.map((node, index) => {
              const atRisk = blocked && node.id !== 'api';
              return (
                <article key={node.id} role="listitem" tabIndex={0} aria-label={`${node.title}, ${blocked ? node.id === 'api' ? 'blocked' : 'potentially at risk' : node.initial.toLowerCase()}, assigned to ${node.owner}`} aria-describedby={`graph-node-detail-${node.id}`} onFocus={() => setFocusedNodeId(node.id)} onBlur={() => setFocusedNodeId(null)} className={`graph-node graph-node--${node.id}${atRisk ? ' graph-node--risk' : ''}${blocked && node.id === 'api' ? ' graph-node--blocked' : ''}`}>
                  <div className="graph-node-top"><span className="graph-node-num">{node.number}</span>{node.id === 'api' && blocked ? <AlertTriangle size={15} /> : <i className={atRisk ? 'node-dot node-dot--risk' : ''} />}</div>
                  <h3>{node.title}</h3>
                  <span className="graph-owner">{node.owner}</span>
                  <span className="sr-only" id={`graph-node-detail-${node.id}`}>{node.id === 'api' ? 'Upstream release task. Use Simulate a Blocker below to inspect downstream effects.' : `This task depends directly or indirectly on API Development. Its status and owner appear in the focus summary while this node is selected.`}</span>
                  <span className={`node-state ${node.id === 'api' && blocked ? 'node-state--blocked' : atRisk ? 'node-state--risk' : ''}`}>
                    {node.id === 'api' && blocked ? 'BLOCKED' : atRisk ? 'AT RISK' : node.initial}
                  </span>
                  {index < nodes.length - 1 && <span className="mobile-link" aria-hidden="true"><ArrowDown size={13} /></span>}
                </article>
              );
            })}
          </div>
        </div>
        <div className="graph-legend"><span><i className="legend-dot legend-dot--active" /> Work in progress</span><span><i className="legend-dot legend-dot--risk" /> Potentially at risk</span><span><i className="legend-line" /> Dependency</span></div>
        <p className="illustrative-note"><CircleHelp size={13} /> Demonstration only · illustrative team and workflow data</p>
      </div>
      <aside className={`domino-aside reveal${blocked ? ' domino-aside--alert' : ''}`}>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{blocked ? 'Blocker simulation active. Four connected downstream tasks may need attention.' : ''}</span>
        <div className="aside-overline"><span className="signal-beacon" />{blocked ? 'SIMULATION ACTIVE' : 'TRY THE DEMO'}</div>
        <h3>{blocked ? 'A blocker ripples.' : 'See the downstream effect.'}</h3>
        {focusedNode && <div className="graph-focus-detail"><span>FOCUSED TASK</span><b>{focusedNode.title}</b><small>{focusedNode.owner} · {blocked ? focusedNode.id === 'api' ? 'blocked in this scenario' : 'potentially at risk in this scenario' : 'connected to the Friday release plan'}</small></div>}
        <p>{blocked ? 'The source task changed. Four connected tasks may now need attention.' : 'Trigger a sample blocker to see how connected work becomes exposed.'}</p>
        <div className="affected-list">
          <span className="overline">{blocked ? 'POTENTIALLY AFFECTED' : 'CONNECTED TASKS'}</span>
          {nodes.slice(1).map((node) => <div className="affected-row" key={node.id}><CornerDownRight size={14} /><span>{node.title}</span><i>{blocked ? 'AT RISK' : 'DOWNSTREAM'}</i></div>)}
        </div>
        <p className="why-exposed"><b>Why they connect</b>{blocked ? 'The test chain relies on the API work; release checks and documentation wait on those prerequisites.' : 'Prerequisites form a path from development through QA and release readiness.'}</p>
        <div className="graph-actions">
          <button className="button button--blue" type="button" onClick={() => setBlocked(true)} disabled={blocked}><Play size={15} fill="currentColor" /> Simulate a Blocker</button>
          <button className="button button--quiet" type="button" onClick={() => setBlocked(false)} disabled={!blocked}><RotateCcw size={14} /> Reset</button>
        </div>
        <span className="demo-caveat">Estimated impact is illustrative, not a live risk score.</span>
      </aside>
    </div>
  );
}

export function WorkflowBuilderDemo() {
  const [generated, setGenerated] = useState(false);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!generated) return;
    let currentStep = 0;
    setStep(currentStep);
    const timer = window.setInterval(() => {
      currentStep += 1;
      if (currentStep >= generationSteps.length) {
        setStep(generationSteps.length - 1);
        window.clearInterval(timer);
        return;
      }
      setStep(currentStep);
    }, 620);
    return () => window.clearInterval(timer);
  }, [generated]);

  const reset = () => { setGenerated(false); setStep(-1); };

  return (
    <div className={`workflow-demo reveal${generated ? ' workflow-demo--generated' : ''}`}>
      <div className="workflow-prompt-panel">
        <div className="prompt-topline"><span className="overline">WORKFLOW BUILDER · DEMONSTRATION</span><span className="sample-pill"><i />SAMPLE MODE</span></div>
        <label className="prompt-label" htmlFor="goal-input">START WITH AN OUTCOME</label>
        <div className="command-box"><Sparkles size={18} /><input id="goal-input" value="Prepare the product release for Friday." readOnly aria-label="Illustrative goal: Prepare the product release for Friday" /><span className="command-cursor" aria-hidden="true" /></div>
        <div className="prompt-actions">
          <button className="button button--blue" type="button" onClick={() => setGenerated(true)} disabled={generated}><Sparkles size={15} />{generated ? 'Sample Plan Ready' : 'Generate Workflow'}<ArrowRight size={15} /></button>
          {generated && <button className="button button--quiet" type="button" onClick={reset}><RotateCcw size={14} /> Reset Demo</button>}
        </div>
        <div className="processing-steps" aria-label="Illustrative plan preparation sequence">
          {generationSteps.map((item, index) => <div className={`processing-step${step >= index ? ' processing-step--done' : ''}${step === index ? ' processing-step--current' : ''}`} key={item}><span>{step > index ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span><span>{item}</span>{step === index && <i aria-hidden="true" />}</div>)}
        </div>
        <p className="simulation-note" role={generated ? 'status' : undefined}>{generated ? 'Sample workflow shown immediately; this control does not call a live AI service.' : 'Illustrative demo — sample workflow data. No live AI request is made.'}</p>
      </div>
      <div className="sample-board" aria-label="Illustrative sample workflow task board">
        <div className="board-head"><div><span className="overline">PLAN PREVIEW · FRIDAY RELEASE</span><h3>{generated ? 'Your sample plan is ready.' : 'A sample plan can take shape.'}</h3></div><span className="board-count">05 <i>TASKS</i></span></div>
        {generated ? <><div className="task-board-head"><span>TASK</span><span>OWNER</span><span>DUE</span><span>PREREQUISITE</span></div>{sampleTasks.map((item, index) => <div className="sample-task" key={item.task}>
          <span className="sample-task-name"><span>{String(index + 1).padStart(2, '0')}</span>{item.task}</span><span className="sample-owner"><i className={`owner-avatar owner-avatar--${index % 3}`}>{item.owner.split(' ').map((part) => part[0]).join('')}</i>{item.owner}</span><span className="sample-date">{item.date}</span><span className="sample-dependency">{item.depends}</span>
        </div>)}</> : <div className="board-empty"><Workflow size={21} /><span><b>Generate the sample plan</b><small>Click Generate Workflow to reveal task owners, dates and prerequisites.</small></span></div>}
        <div className="board-foot"><span><i className="legend-dot legend-dot--active" /> Sample owners and dates</span><span>Review before activation <ArrowRight size={13} /></span></div>
      </div>
    </div>
  );
}
