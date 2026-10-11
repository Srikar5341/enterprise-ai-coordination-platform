"use client";

import { useState } from 'react';
import { ArrowRight, Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, ChevronDown, CircleCheck, Clock3, CornerDownRight, GitBranch, LayoutDashboard, ListTodo, MoreHorizontal, Network, ShieldCheck, SlidersHorizontal, Sparkles, Users, Workflow } from 'lucide-react';

export type RecoveryChoice = 'fastest' | 'balanced';

export const recoveryChoiceDetails: Record<RecoveryChoice, { name: string; change: string; schedule: string; workload: string; assumption: string }> = {
  fastest: { name: 'Option A · Fastest', change: 'Assign API Integration to Noah Chen.', schedule: 'Friday target*', workload: '+17% planned load on Noah', assumption: "Assumes Noah's displayed headroom remains available; the added load may displace existing work." },
  balanced: { name: 'Option B · Balanced', change: 'Pair on API Integration, then distribute QA across Noah and Sam.', schedule: '+0.5 day buffer*', workload: 'Workload distributed', assumption: 'Assumes QA scope can be split and Sam is available; the slip may affect Friday.' },
};

const people = [
  { initials: 'MP', name: 'Maya Patel', role: 'API · Infrastructure', load: 76, color: 'blue' },
  { initials: 'NC', name: 'Noah Chen', role: 'Integration · Backend', load: 54, color: 'green' },
  { initials: 'SR', name: 'Sam Rivera', role: 'QA · Release', load: 42, color: 'amber' },
];

const graphTasks = [
  { id: '01', label: 'API Development', meta: 'Maya Patel · 2d', variant: 'api' },
  { id: '02', label: 'Integration Testing', meta: 'Noah Chen · 1d', variant: 'integration' },
  { id: '03', label: 'QA Validation', meta: 'Sam Rivera · 1d', variant: 'qa' },
  { id: '04', label: 'Release Readiness', meta: 'Sam Rivera · 0.5d', variant: 'release' },
];

function Avatar({ children, tone = 'blue' }: { children: string; tone?: string }) {
  return <span className={`team-avatar team-avatar--${tone}`}>{children}</span>;
}

export function ProductPreview({ stage }: { stage: number }) {
  const blocked = stage >= 3;
  const atRisk = stage >= 4;
  return (
    <div className="hero-product-window" data-phase={stage} role="region" aria-label="Illustrative Friday Product Release preview with four release-path tasks and one documentation branch">
      <div className="window-titlebar"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><span>RENOVA&nbsp; / &nbsp;WORKSPACE</span><span className="window-lockup"><span className="live-dot" /> ILLUSTRATIVE PREVIEW</span></div>
          <div className="app-topbar"><span className="app-square">R</span><span className="app-brand">Renova</span><span className="app-separator" /><span className="app-crumb">Workflows</span><ArrowRight size={12} /><b>Friday Product Release</b><span className="app-more" aria-hidden="true"><MoreHorizontal size={16} /></span><Avatar tone="indigo">TL</Avatar></div>
      <div className="hero-app-layout">
        <aside className="app-rail" aria-label="Sample workspace menu"><div className="rail-item rail-item--selected"><LayoutDashboard size={14} />Overview</div><div className="rail-item"><Workflow size={14} />Workflows</div><div className="rail-item"><Users size={14} />Team</div><div className="rail-item"><Activity size={14} />Activity</div><div className="rail-bottom"><span className="live-dot" /> Demo data</div></aside>
        <div className="hero-app-main">
          <div className="goal-bar"><span className="goal-target"><Sparkles size={14} />RELEASE GOAL</span><div><b>Prepare the product release for Friday.</b><small>Goal mapped to a coordinated workflow</small></div><span className="target-badge"><Clock3 size={12} />FRI 16 OCT</span></div>
          <div className="app-stats-row"><div><span>WORKFLOW STATUS</span><b><i className="live-dot" />IN PROGRESS</b></div><div><span>TASKS</span><b>05 <small>linked</small></b></div><div><span>TARGET</span><b>Friday <small>release</small></b></div><div className="stage-readout"><span>SYSTEM MOMENT</span><b>{['Goal mapped','Tasks connected','Team allocated','Blocker detected','Impact traced','Impact summary','Options compared','Approval requested'][stage]}</b></div></div>
          <div className="graph-head"><span className="overline">RELEASE PATH · DEPENDENCIES</span><span className="screen-filter" aria-hidden="true"><SlidersHorizontal size={12} /> FILTER</span></div>
          <div className="hero-taskmap" role="group" aria-label="Four-task Friday release dependency sequence; documentation is shown as a separate API-dependent work item">
            {graphTasks.map((task, index) => <div className="hero-task-wrap" key={task.id}>
              <article className={`hero-task-card hero-task-card--${task.variant}${task.variant === 'api' && blocked ? ' hero-task-card--blocked' : ''}${index > 0 && atRisk ? ' hero-task-card--risk' : ''}`}>
                <div className="hero-task-meta"><span>{task.id}</span>{task.variant === 'api' && blocked ? <AlertTriangle size={13} /> : <i />}</div>
                <b>{task.label}</b><small>{task.meta}</small>
                <span className={`hero-task-status${task.variant === 'api' && blocked ? ' hero-task-status--blocked' : index > 0 && atRisk ? ' hero-task-status--risk' : ''}`}>{task.variant === 'api' && blocked ? 'BLOCKED' : index > 0 && atRisk ? 'AT RISK' : index === 0 ? 'ACTIVE' : 'READY'}</span>
              </article>{index < graphTasks.length - 1 && <div className={`task-link${atRisk ? ' task-link--alert' : ''}`} aria-hidden="true"><span /><ArrowRight size={14} /></div>}
            </div>)}
          </div>
          <div className="release-subtask"><span className="subtask-connector"><CornerDownRight size={14} /></span><span className="subtask-mark"><ListTodo size={13} /></span><b>Documentation</b><small>Noah Chen · depends on API Integration</small><span className={`mini-status${atRisk ? ' mini-status--risk' : ''}`}>{atRisk ? 'AT RISK' : 'READY'}</span></div>
          <div className="hero-footer-meta"><span><Network size={12} />Five linked work items</span><span><ShieldCheck size={12} />Changes require lead review</span></div>
        </div>
      </div>
    </div>
  );
}

export function CapacityFloat() {
  return <aside className="float-panel capacity-float" aria-label="Illustrative Team Capacity panel. Bars show planned workload, not verified availability."><div className="float-title"><span><Users size={13} /> TEAM CAPACITY</span><MoreHorizontal size={15} /></div>{people.map((person) => <div className="capacity-row" key={person.initials}><Avatar tone={person.color}>{person.initials}</Avatar><span className="capacity-person"><b>{person.name}</b><small>{person.role}</small><i><em style={{ width: `${person.load}%` }} /></i></span><strong>{person.load}<small>%</small></strong></div>)}<div className="float-foot"><span>3 people · PLANNED LOAD</span><span>Illustrative <ChevronDown size={11} /></span></div></aside>;
}

export function RecoveryFloat({ stage }: { stage: number }) {
  const optionsReady = stage >= 6;
  const approvalReady = stage >= 7;
  return <aside className={`float-panel recovery-float${stage >= 5 ? ' recovery-float--entered' : ''}`} aria-label="Illustrative Recovery Analysis panel"><div className="float-title"><span><AlertTriangle size={13} /> RECOVERY ANALYSIS</span><span className="impact-indicator"><i />{stage >= 5 ? 'IMPACT DETECTED' : 'MONITORING'}</span></div><div className="recovery-float-score"><span className="impact-ring"><b>4</b><small>tasks</small></span><span><b>downstream tasks affected</b><small>Directional demo estimate · sample workflow</small></span></div><div className="float-options"><span className={optionsReady ? 'option-revealed' : ''}><b>A</b> Fastest <i>· Friday target*</i></span><span className={optionsReady ? 'option-revealed' : ''}><b>B</b> Balanced <i>· workload shared</i></span></div><div className={`approval-flag${approvalReady ? ' approval-flag--ready' : ''}`}><Clock3 size={12} />{approvalReady ? 'PENDING APPROVAL' : 'LEAD REVIEW REQUIRED'}</div></aside>;
}

export function RecoveryDemo({ onReview }: { onReview: (choice: RecoveryChoice) => void }) {
  const [selected, setSelected] = useState<'fastest' | 'balanced'>('fastest');
  return (
    <div className="recovery-workbench reveal" role="region" aria-label="Illustrative recovery analysis and alternatives">
      <div className="workbench-top"><div className="workbench-id"><span className="workbench-icon"><GitBranch size={16} /></span><span><small>RECOVERY CENTER / SAMPLE</small><b>Friday Product Release</b></span></div><span className="status-tag status-tag--amber"><i />Scenario · sample data</span><span className="icon-control" aria-hidden="true"><MoreHorizontal size={16} /></span></div>
      <div className="recovery-panels">
        <section className="impact-map-panel" aria-labelledby="impact-map-heading">
          <div className="panel-overline"><span>01 / IMPACT MAP</span><span className="status-tag status-tag--red"><i />SOURCE BLOCKED</span></div>
          <h3 id="impact-map-heading">API Developer · Maya Patel unavailable</h3>
          <p className="panel-copy">Maya Patel is marked unavailable for the assigned API Integration subtask. Downstream work is traced for lead review before any change.</p>
          <div className="impact-visual">
            <svg viewBox="0 0 660 230" preserveAspectRatio="none" className="impact-svg" aria-hidden="true"><path d="M70 59H205M225 59C275 59 290 110 315 110H440M460 110C505 110 520 59 570 59M225 71C270 71 270 181 315 181H440" /><path className="impact-svg--signal" d="M70 59H205M225 59C275 59 290 110 315 110H440M460 110C505 110 520 59 570 59M225 71C270 71 270 181 315 181H440" /></svg>
          <div className="impact-map-nodes"><span className="impact-node impact-node--source"><i />API Integration<br /><small>MAYA UNAVAILABLE</small></span><span className="impact-node impact-node--risk">Integration<br /><small>TESTING</small></span><span className="impact-node impact-node--risk">QA Validation<br /><small>AT RISK</small></span><span className="impact-node impact-node--risk">Release<br /><small>READINESS</small></span><span className="impact-node impact-node--risk impact-node--docs">Documentation<br /><small>AT RISK</small></span></div>
          </div>
          <div className="impact-capacity" role="group" aria-label="Illustrative planned workload for the three sample developers; availability requires confirmation"><Users size={13} /><div className="impact-capacity-content"><b>ILLUSTRATIVE TEAM CAPACITY</b><div className="impact-capacity-people"><span className="impact-person impact-person--unavailable"><span>MAYA · UNAVAILABLE</span><i><em style={{ width: '76%' }} /></i><small>76% planned load</small></span><span className="impact-person"><span>NOAH · CANDIDATE</span><i><em style={{ width: '54%' }} /></i><small>54% load · 46% displayed headroom</small></span><span className="impact-person"><span>SAM · QA</span><i><em style={{ width: '42%' }} /></i><small>42% planned load · confirm</small></span></div><small className="impact-capacity-note">Illustrative values · actual availability and workload must be rechecked.</small></div></div><div className="impact-meter"><div className="meter-readout"><span><b>ESTIMATED IMPACT</b><small>Not a validated prediction or probability</small></span><strong>71<span>/100</span></strong></div><div className="meter-track"><i /></div><div className="factor-grid"><span><small>DEPENDENCY IMPACT</small><b>4 downstream tasks</b></span><span><small>DEADLINE URGENCY</small><b>Friday target</b></span><span><small>RECOVERY DIFFICULTY</small><b>Skill-dependent</b></span></div></div>
          <div className="impact-explanation"><ArrowDownRight size={15} /><span><b>Why the plan is exposed</b>API Integration is a subtask of API Development. Integration Testing and Documentation depend on the API work; QA depends on testing; Release Readiness depends on QA and documentation.</span></div>
          <span className="sample-disclaimer">Illustrative scenario · assess actual skills, availability, workload, permissions and dependencies before proposing changes.</span>
        </section>
        <section className="recovery-options-panel" aria-labelledby="recovery-options-heading">
          <div className="panel-overline"><span>02 / RECOVERY ALTERNATIVES</span><span className="options-availability"><i />CONSTRAINTS VISIBLE</span></div>
          <div className="recovery-title-row"><div><h3 id="recovery-options-heading">Compare ways forward.</h3><p className="panel-copy">Trade-offs shown against illustrative team and deadline data.</p></div><span className="compass-visual"><Network size={25} /></span></div>
          <div className="option-comparison" role="group" aria-label="Select an illustrative recovery option for review">
              <button className={`option-panel${selected === 'fastest' ? ' option-panel--active' : ''}`} type="button" aria-pressed={selected === 'fastest'} onClick={() => setSelected('fastest')}>
              <span className="option-caption"><b>A · FASTEST</b><i>TARGET HELD*</i></span><strong>Assign API Integration</strong><span className="option-owner"><Avatar tone="green">NC</Avatar>Noah Chen · backend fit</span><div className="option-lines"><span><small>SCHEDULE</small><b>Friday target*</b></span><span><small>WORKLOAD</small><b className="warning-text">+17% · elevated</b></span></div><p>Assumes Noah's displayed headroom remains available and testing follows; residual risk: added load may displace existing work.</p>
            </button>
              <button className={`option-panel${selected === 'balanced' ? ' option-panel--active' : ''}`} type="button" aria-pressed={selected === 'balanced'} onClick={() => setSelected('balanced')}>
              <span className="option-caption"><b>B · BALANCED</b><i>CAPACITY FIRST</i></span><strong>Pair, then distribute QA</strong><span className="option-owner"><Avatar tone="amber">SR</Avatar>Noah + Sam · shared load</span><div className="option-lines"><span><small>SCHEDULE</small><b>+0.5 day buffer*</b></span><span><small>WORKLOAD</small><b className="success-text">Distributed</b></span></div><p>Assumes scope splits across backend and QA skills with Sam available; residual risk: a 0.5-day slip may affect Friday.</p>
            </button>
          </div>
          <div className="tradeoff-callout"><Sparkles size={14} /><span><b>Different constraints, different answer.</b> Option A protects timing with a workload increase; Option B gives the release more buffer while spreading the load.</span></div>
          <div className="recovery-action-row"><span className="awaiting-approval"><Clock3 size={15} /> Awaiting Lead Approval</span><button className="button button--blue" type="button" onClick={() => onReview(selected)}>Review Recovery Plan <ArrowRight size={15} /></button></div>
          <span className="no-mutation-note"><ShieldCheck size={13} /> Review-only demo · no task, owner, or date is changed.</span>
        </section>
      </div>
    </div>
  );
}

export function ApprovalPanel() {
  return (
      <div className="approval-console reveal" role="region" aria-label="Illustrative approval and verification console">
      <div className="console-heading"><span><ShieldCheck size={17} /> CHANGE CONTROL</span><span className="status-tag status-tag--amber"><i />AWAITING LEAD</span></div>
      <div className="change-summary"><span className="console-kicker">PROPOSED UPDATE · SAMPLE ONLY</span><h3>Reassign API Integration</h3><div className="assignment-change"><Avatar tone="blue">MP</Avatar><span>Maya Patel</span><ArrowRight size={14} /><Avatar tone="green">NC</Avatar><b>Noah Chen</b></div><p>Skill match: backend integration · illustrative planned load: 54%, subject to live availability checks.</p></div>
      <div className="approval-line"><div><span className="approval-step approval-step--done"><Check size={12} /></span><span><b>Analyze</b><small>Impact and assumptions visible</small></span><CircleCheck size={16} className="success-icon" /></div><div><span className="approval-step">02</span><span><b>Approve</b><small>Authorized lead action required</small></span><span className="pending-copy">PENDING</span></div><div><span className="approval-step">03</span><span><b>Verify</b><small>Read back resulting task state</small></span><span className="pending-copy">NOT RUN</span></div></div>
      <div className="verification-box"><span className="verification-shield"><ShieldCheck size={17} /></span><span><b>VERIFICATION RESULT</b><small>Not run · no changes applied · sample data only</small></span><span className="waiting-label">WAITING</span></div><div className="remaining-issues"><AlertTriangle size={12} />Remaining blocker: API Developer availability is not confirmed.</div>
      <div className="audit-foot"><span>Audit event shown only where implemented</span><button type="button" disabled className="disabled-approve">Approve change <Check size={13} /></button></div>
    </div>
  );
}

export function LeadWorkspacePreview() {
  return (
    <div className="role-window role-window--lead" role="region" aria-label="Illustrative team-lead workspace">
      <div className="role-window-head"><span className="app-square">R</span><b>Friday Product Release</b><span className="window-state"><i />ACTIVE</span><MoreHorizontal size={15} /></div>
      <div className="lead-overview"><div><small>WORKFLOW</small><b><i className="live-dot" />In progress</b></div><div><small>TEAM LOAD</small><b>57% <span>average</span></b></div><div><small>RELEASE TARGET</small><b>Friday <span>Oct 16</span></b></div></div>
      <div className="role-table"><div className="role-table-head"><span>TASK / ASSIGNEE</span><span>CAPACITY</span><span>STATE</span></div><div className="role-table-row"><span><i className="table-task-dot table-task-dot--red" /> API Development <small>Maya Patel</small></span><span><i className="micro-bar"><em style={{ width: '76%' }} /></i>76%</span><em className="mini-status mini-status--risk">BLOCKED</em></div><div className="role-table-row"><span><i className="table-task-dot" /> Integration Testing <small>Noah Chen</small></span><span><i className="micro-bar"><em style={{ width: '54%' }} /></i>54%</span><em className="mini-status">READY</em></div><div className="role-table-row"><span><i className="table-task-dot" /> QA Validation <small>Sam Rivera</small></span><span><i className="micro-bar"><em style={{ width: '42%' }} /></i>42%</span><em className="mini-status">READY</em></div></div>
      <div className="role-alert"><AlertTriangle size={14} /><span><b>Recovery proposal</b>Compare 2 options before approving</span><span>OPEN <ArrowUpRight size={12} /></span></div>
    </div>
  );
}

export function EmployeeWorkspacePreview() {
  return (
    <div className="role-window role-window--employee" role="region" aria-label="Illustrative employee task workspace. Update progress and Report blocker are inactive mockup labels, not controls.">
      <div className="role-window-head"><span className="app-square">R</span><b>My work</b><span className="window-state">ILLUSTRATIVE PREVIEW</span><MoreHorizontal size={15} /></div>
      <div className="employee-intro"><Avatar tone="green">NC</Avatar><span><small>THURSDAY · 15 OCT</small><b>Good morning, Noah.</b><i>Here’s what’s next in your workflow.</i></span></div>
      <div className="employee-task-focus"><div className="focus-kicker"><span className="mini-status mini-status--blue">NEXT UP</span><span>EST. 1 DAY</span></div><h3>Integration Testing</h3><p>Run the integration suite once the API contract is ready.</p><div className="prereq-row"><span><GitBranch size={13} />PREREQUISITE</span><b>API Development</b><span className="mini-status mini-status--blue">WAITING</span></div><div className="acceptance-row"><span><Check size={13} />ACCEPTANCE CRITERIA</span><small>All release API endpoints pass the integration suite.</small></div><div className="mock-action-note">Illustrative preview · controls shown, not active</div><div className="task-action-row"><span className="mock-action-display"><ListTodo size={13} /> Update progress</span><span className="mock-action-display mock-action-display--risk"><AlertTriangle size={13} /> Report blocker</span></div></div>
      <div className="assistant-strip" role="group" aria-label="Illustrative AI Work Assistant draft for the selected task">
        <div className="assistant-strip-head"><Sparkles size={12} />AI WORK ASSISTANT<span className="assistant-strip-chip">DRAFT</span></div>
        <p className="assistant-strip-ask">&ldquo;Break Integration Testing into steps for me.&rdquo;</p>
        <ol className="assistant-strip-steps">
          <li><i>1</i>Confirm the API contract is merged and accessible</li>
          <li><i>2</i>Run the integration suite against the staging build</li>
          <li><i>3</i>Post the results and update the task status</li>
        </ol>
        <small>Proposed checklist — review and edit before use. The assistant drafts only; it never changes task states or team plans.</small>
      </div>
      <div className="employee-update"><span className="live-dot" />Lead proposed a change to the shared release plan. <b>Review visible</b></div>
    </div>
  );
}
