"use client";

import { useRef } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, AlertTriangle, Check, Clock3, GitBranch, MoreHorizontal, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useReducedMotion } from './useMotion';

const slides = [
  { number: '01', title: 'Workflow Overview', note: 'One illustrative view of the goal, release milestones, dependencies, and team state.', kind: 'overview' },
  { number: '02', title: 'Task Dependency Graph', note: 'See which prerequisites shape the path from development to release.', kind: 'graph' },
  { number: '03', title: 'Team Allocation', note: 'Review skill match, availability, and workload before assignment.', kind: 'allocation' },
  { number: '04', title: 'Recovery Center', note: 'Compare schedule and workload trade-offs before a lead decides.', kind: 'recovery' },
  { number: '05', title: 'Approval and Verification', note: 'Keep proposed changes pending until approval and resulting state are checked.', kind: 'approval' },
  { number: '06', title: 'AI Work Assistant', note: 'Employee-side help for breaking down work, research, and drafts — kept separate from lead-owned recovery.', kind: 'assistant' },
] as const;

function OverviewScreen() {
  return <div className="gallery-screen gallery-screen--overview"><div className="gallery-appbar"><span className="app-square">R</span><b>Release overview</b><span className="screen-live"><i />SAMPLE PLAN</span><MoreHorizontal size={14} /></div><div className="screen-stat-row"><div><small>PLAN GOAL</small><b>Friday product release</b></div><div><small>TASKS</small><b>05 <i>linked</i></b></div><div><small>TEAM</small><b><Users size={12} /> 3 members</b></div></div><div className="overview-screen-body"><div className="release-progress"><span>RELEASE WORKFLOW</span><i><em /></i><b>42% <small>illustrative</small></b></div><div className="mini-lanes"><div><i className="lane-mark"><GitBranch size={10} /></i><span><b>API Development</b><small>Maya Patel · includes API Integration</small></span><em>IN PROGRESS</em></div><div><i className="lane-mark"><GitBranch size={10} /></i><span><b>Integration Testing</b><small>Noah Chen · depends on API</small></span><em>QUEUED</em></div><div><i className="lane-mark"><GitBranch size={10} /></i><span><b>QA Validation</b><small>Sam Rivera</small></span><em>QUEUED</em></div></div><div className="screen-side-note"><span><Clock3 size={12} />TARGET WINDOW</span><b>Friday · 16 Oct</b><small>+ Documentation · Release Readiness</small></div></div></div>;
}

function DependencyScreen() {
  return <div className="gallery-screen gallery-screen--graph"><div className="gallery-appbar"><span className="app-square">R</span><b>Task dependency map</b><span className="screen-live"><i />5 TASKS</span><MoreHorizontal size={14} /></div><div className="gallery-dependency"><svg viewBox="0 0 500 190" preserveAspectRatio="none" aria-hidden="true"><path d="M120 45H172M328 45H375M93 78C86 105 92 130 117 149M407 78C414 105 408 130 383 149" /><path className="dep-highlight" d="M120 45H172M328 45H375M93 78C86 105 92 130 117 149M407 78C414 105 408 130 383 149" /></svg><div className="gallery-node gnode-api"><small>01 · IN PROGRESS</small><b>API Development</b><i>Maya Patel</i></div><div className="gallery-node gnode-int"><small>02 · QUEUED</small><b>Integration Testing</b><i>Noah Chen</i></div><div className="gallery-node gnode-qa"><small>03 · QUEUED</small><b>QA Validation</b><i>Sam Rivera</i></div><div className="gallery-node gnode-doc"><small>04 · PREREQUISITE</small><b>Documentation</b><i>API Integration · Noah Chen</i></div><div className="gallery-node gnode-release"><small>05 · NEXT</small><b>Release Readiness</b><i>Sam Rivera</i></div></div><div className="screen-note-strip"><GitBranch size={12} />Four downstream tasks may be affected · sample data only</div></div>;
}

function AllocationScreen() {
  const people = [{ name: 'Maya Patel', role: 'API · Infrastructure', load: 76, match: 'Unavailable', fit: 'unavailable' }, { name: 'Noah Chen', role: 'Integration · Backend', load: 54, match: 'Strong backend fit', fit: 'strong' }, { name: 'Sam Rivera', role: 'QA · Release', load: 42, match: 'QA pairing only', fit: 'review' }];
  return <div className="gallery-screen gallery-screen--allocation"><div className="gallery-appbar"><span className="app-square">R</span><b>Team allocation</b><span className="screen-live"><i />SKILL-AWARE</span><MoreHorizontal size={14} /></div><div className="allocation-summary"><div><small>ELIGIBLE FOR</small><b>API Integration</b></div><span><Users size={14} /> 3 members</span></div><div className="allocation-table"><div className="allocation-table-head"><span>TEAMMATE</span><span>SKILL FIT</span><span>WORKLOAD</span></div>{people.map((person) => <div className="allocation-row" key={person.name}><span><i className="person-initials">{person.name.split(' ').map((part) => part[0]).join('')}</i><span><b>{person.name}</b><small>{person.role}</small></span></span><em className={`allocation-fit allocation-fit--${person.fit}`}>{person.fit === 'unavailable' && <AlertTriangle size={11} />}{person.match}</em><span><i className="capacity-line"><i style={{ width: `${person.load}%` }} /></i>{person.load}%</span></div>)}</div><div className="allocation-footer"><ShieldCheck size={13} />Availability and reasons need lead confirmation</div></div>;
}

function RecoveryScreen() {
  return <div className="gallery-screen gallery-screen--recovery"><div className="gallery-appbar"><span className="app-square">R</span><b>Recovery center</b><span className="screen-live screen-live--amber"><i />2 OPTIONS</span><MoreHorizontal size={14} /></div><div className="recovery-mini-callout"><ArrowDownRight size={13} /><span><b>API Developer unavailable</b><small>4 dependent tasks may need attention</small></span><em>ESTIMATED</em></div><div className="mini-option-stack"><div><span>A <b>FASTEST</b></span><strong>Assign API integration to Noah</strong><small>Friday target* <i>· +17% workload</i></small></div><div><span>B <b>BALANCED</b></span><strong>Pair Noah + Sam</strong><small>+0.5 day buffer* <i>· split by skills</i></small></div></div><div className="screen-note-strip"><Clock3 size={12} />Awaiting Lead Approval · sample options</div></div>;
}

function ApprovalScreen() {
  return <div className="gallery-screen gallery-screen--approval"><div className="gallery-appbar"><span className="app-square">R</span><b>Review change</b><span className="screen-live screen-live--amber"><i />PENDING</span><MoreHorizontal size={14} /></div><div className="approval-mini-head"><span><ShieldCheck size={13} />CHANGE PROPOSAL</span><small>Sample · not applied</small></div><div className="approval-mini-diff"><span>API Integration</span><b>Maya Patel <ArrowRight size={11} /> Noah Chen</b><small>Reason: backend fit · illustrative capacity view</small></div><div className="approval-mini-progress"><span className="approval-mini-step approval-mini-step--done"><Check size={10} /></span><i /><span className="approval-mini-step">02</span><i /><span className="approval-mini-step">03</span><small>Analyze / Approve / Verify</small></div><div className="approval-mini-result"><Clock3 size={13} /><span><b>Verification has not run</b><small>No state change has been applied</small></span></div></div>;
}

function AssistantScreen() {
  return <div className="gallery-screen gallery-screen--assistant"><div className="gallery-appbar"><span className="app-square">R</span><b>AI Work Assistant</b><span className="screen-live"><i />DRAFT MODE</span><MoreHorizontal size={14} /></div><div className="assistant-mini-context"><span className="mini-status mini-status--blue">OPEN TASK</span><b>Integration Testing</b><small>Run the integration suite once the API contract is ready.</small></div><div className="assistant-mini-ask"><Sparkles size={12} /><span>&ldquo;Break this task into steps for me.&rdquo;</span></div><div className="assistant-mini-draft"><span className="assistant-mini-draft-head"><Sparkles size={11} /> AI DRAFT · REVIEW BEFORE USE</span><ol><li><i>1</i><span>Confirm the API contract is merged</span></li><li><i>2</i><span>Run the integration suite on staging</span></li><li><i>3</i><span>Attach results to the task update</span></li></ol></div><div className="screen-note-strip"><ShieldCheck size={12} />Employee drafts only · team-level recovery stays with the lead</div></div>;
}

function Screen({ kind }: { kind: string }) {
  if (kind === 'overview') return <OverviewScreen />;
  if (kind === 'graph') return <DependencyScreen />;
  if (kind === 'allocation') return <AllocationScreen />;
  if (kind === 'recovery') return <RecoveryScreen />;
  if (kind === 'assistant') return <AssistantScreen />;
  return <ApprovalScreen />;
}

export default function ProductGallery() {
  const railRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const scroll = (direction: number) => railRef.current?.scrollBy({ left: direction * 390, behavior: reducedMotion ? 'instant' : 'smooth' });

  return (
    <section className="product-gallery" id="product-gallery" aria-labelledby="gallery-title">
      <div className="gallery-heading page-width reveal"><div><span className="overline">BUILT AROUND REAL WORK</span><h2 id="gallery-title">Connected work.<br /><span>Clear next steps.</span></h2></div><div className="gallery-heading-side"><p>Six product views of the same illustrative Friday release workflow—from intent through impact, allocation, controlled change, and the employee's AI assistant.</p><div className="gallery-controls"><button type="button" aria-label="Scroll gallery left" onClick={() => scroll(-1)}><ArrowLeft size={16} /></button><button type="button" aria-label="Scroll gallery right" onClick={() => scroll(1)}><ArrowRight size={16} /></button></div></div></div>
      <div ref={railRef} className="gallery-rail" role="region" aria-roledescription="carousel" aria-label="Six Renova product screen previews" tabIndex={0} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); scroll(-1); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); scroll(1); }
      }}>
        {slides.map((slide) => <article className={`gallery-card gallery-card--${slide.kind} reveal`} key={slide.number}>
          <div className="gallery-card-ui"><Screen kind={slide.kind} /></div>
          <div className="gallery-card-caption"><span>{slide.number}<i /> PRODUCT VIEW</span><h3>{slide.title}</h3><p>{slide.note}</p></div>
        </article>)}
      </div>
      <div className="gallery-note page-width"><span><i className="live-dot" />ILLUSTRATIVE PRODUCT CONCEPT</span><span>All interface data shown is sample data</span></div>
    </section>
  );
}
