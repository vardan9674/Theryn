import React, { useEffect, useRef, useState } from 'react';
import '../../src/index.css';
import '../../src/coach/coach.css';
import { Avatar, Button, Checkbox, Icon, Tabs } from '../../src/coach/ui/primitives.jsx';
import './preview.css';

// Design-only entry point: no auth, backend, storage, native sharing, or live links.
const FIELDS = [
  { id: 'chest', label: 'Chest', hint: 'Wrap the tape around the fullest part of your chest. Keep it level and breathe normally.', x: 130, y: 103 },
  { id: 'waist', label: 'Waist', hint: 'Measure around your natural waist, between your lowest rib and the top of your hips. Keep the tape snug, without pulling it tight.', x: 130, y: 145 },
  { id: 'hips', label: 'Hips', hint: 'Stand with your feet together and measure around the fullest part of your hips.', x: 130, y: 181 },
  { id: 'arm', label: 'Left arm', hint: 'Let your left arm relax at your side. Measure around the middle of your upper arm.', x: 188, y: 121 },
  { id: 'thigh', label: 'Left thigh', hint: 'Measure around the fullest part of your left thigh, standing with your weight evenly balanced.', x: 151, y: 235 },
];
const EXERCISES = [
  { id: 'bench', name: 'Barbell bench press', sets: '3', reps: '8–10', weight: '40', note: 'Lower slowly. Keep your feet planted.' },
  { id: 'incline', name: 'Incline dumbbell press', sets: '3', reps: '10–12', weight: '12', note: 'Weight is per dumbbell.' },
  { id: 'shoulder', name: 'Seated shoulder press', sets: '3', reps: '10', weight: '10', note: 'Weight is per dumbbell. Keep the movement controlled.' },
  { id: 'raise', name: 'Lateral raise', sets: '3', reps: '12–15', weight: '5', note: 'Weight is per dumbbell. Lead with your elbows.' },
  { id: 'triceps', name: 'Cable triceps pushdown', sets: '3', reps: '12', weight: '15', note: 'Keep your elbows close to your sides.' },
];
const SCREEN_TABS = [{ id: 'coach', label: 'Coach' }, { id: 'measurements', label: 'Measurements' }, { id: 'workout', label: 'Workout' }];

function Tag({ children, active }) { return <span className={`sl-tag ${active ? 'sl-tag-active' : ''}`}>{children}</span>; }
function Brand() { return <div className="cx-brand"><img src="/theryn-logo.svg" alt="" /><span>theryn</span></div>; }
function Lock() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>; }
function GuestHeader() { return <header className="sl-header"><Brand /><span className="sl-private"><Lock /> Private check-in</span></header>; }
function CoachByline() { return <div className="sl-byline"><Avatar name="Sam Taylor" size="sm" /><span>From your coach, <strong>Sam Taylor</strong></span></div>; }
function PageIntro({ eyebrow, title, children }) { return <div className="sl-intro"><div className="sl-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{children}</p></div>; }

function BodyDiagram({ selected, onSelect, requested }) {
  return <svg className="sl-body" viewBox="0 0 260 330" role="group" aria-label="Select a body measurement">
    <path className="sl-body-guide" d="M130 12v306M38 103h184M38 145h184M38 181h184M38 235h184" />
    <g className="sl-silhouette">
      <path d="M130 21c-12 0-19 9-19 21 0 11 6 21 12 24v11l-24 8c-11 4-16 11-19 23l-12 49-14 48c-2 7 2 11 7 9l8-8 12-40 17-39 5 30-8 33 10 28 5 47-4 43-9 8c-4 4-2 8 4 8h17l5-12 5-49 2-35 2 35 5 49 5 12h17c6 0 8-4 4-8l-9-8-4-43 5-47 10-28-8-33 5-30 17 39 12 40 8 8c5 2 9-2 7-9l-14-48-12-49c-3-12-8-19-19-23l-24-8V66c6-3 12-13 12-24 0-12-7-21-19-21Z" />
      <path d="M105 101q25 12 50 0M103 145q27 8 54 0M98 181q32 10 64 0M130 192v36" fill="none" />
    </g>
    {FIELDS.filter(f => requested.includes(f.id)).map(f => <g key={f.id} role="button" tabIndex="0" aria-label={`Show ${f.label.toLowerCase()} measuring guide`} aria-pressed={selected === f.id} className={`sl-hotspot ${selected === f.id ? 'selected' : ''}`} onClick={() => onSelect(f.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(f.id); } }}>
      <circle cx={f.x} cy={f.y} r="22" fill="transparent" stroke="none" />
      <circle className="sl-hotspot-halo" cx={f.x} cy={f.y} r="14" />
      <circle className="sl-hotspot-dot" cx={f.x} cy={f.y} r="5" />
    </g>)}
    <text x="130" y="327" textAnchor="middle">FRONT VIEW</text>
  </svg>;
}

function Receipt({ kind, result, onCoach, onAgain }) {
  return <><GuestHeader /><main className="sl-receipt">
    <div className="sl-success-mark"><Icon.Check size={28} /></div>
    <div className="sl-eyebrow">CHECK-IN COMPLETE</div>
    <h1>Sent to Coach Sam.</h1>
    <p>{kind === 'measurements' ? 'Your measurements are ready for your coach to review.' : 'Your coach can now see how your workout went.'}</p>
    <div className="cx-card sl-receipt-card"><Icon.Check size={18} /><div><strong>{kind === 'measurements' ? 'Body measurements' : 'Monday · Push day'}</strong><span>{kind === 'measurements' ? `${Object.keys(result.values).filter(k => result.values[k] !== '').length} measurements submitted` : `${result.done} of 5 exercises completed${result.skipped ? ` · ${result.skipped} skipped` : ''}`}</span></div><Tag active>Received</Tag></div>
    <p className="sl-small">You’re all set. You can close this page.</p>
    <div className="sl-demo-actions"><span>Preview controls</span><Button onClick={onCoach}>See coach’s view <Icon.Chevron size={16} /></Button><button className="sl-text-button" onClick={onAgain}>Try this check-in again</button></div>
  </main></>;
}

function Measurements({ requested, result, onSubmit, onCoach, onAgain }) {
  const [selected, setSelected] = useState(requested[0] || 'waist');
  const [unit, setUnit] = useState('metric');
  const [values, setValues] = useState({});
  const [date, setDate] = useState('2026-09-14');
  const [error, setError] = useState('');
  const refs = useRef({});
  const field = FIELDS.find(f => f.id === selected) || FIELDS[0];
  const fields = FIELDS.filter(f => requested.includes(f.id));
  const count = fields.filter(f => values[f.id] && Number(values[f.id]) > 0).length;
  const select = id => { setSelected(id); refs.current[id]?.focus({ preventScroll: true }); };
  const switchUnit = next => {
    if (next === unit) return;
    setValues(old => Object.fromEntries(Object.entries(old).map(([k, v]) => [k, v === '' ? '' : String(Math.round(Number(v) * (next === 'metric' ? (k === 'weight' ? 0.45359237 : 2.54) : (k === 'weight' ? 2.20462262 : 1 / 2.54)) * 10) / 10)])));
    setUnit(next);
  };
  const submit = e => {
    e.preventDefault();
    if (!date || fields.some(f => !Number.isFinite(Number(values[f.id])) || Number(values[f.id]) <= 0)) { setError('Please enter each requested measurement before sending.'); return; }
    setError(''); onSubmit({ values, unit, date });
  };
  if (result) return <Receipt kind="measurements" result={result} onCoach={onCoach} onAgain={onAgain} />;
  return <><GuestHeader /><form onSubmit={submit} className="sl-guest-form">
    <main className="sl-guest-main">
      <CoachByline /><PageIntro eyebrow="BODY CHECK-IN" title="Body measurements.">Hi Alex. Add the measurements your coach requested.<br className="sl-desktop-break" /> No app or account needed.</PageIntro>
      <div className="sl-meta-row"><label className="sl-date-label">Measured on<input aria-label="Measurement date" className="cx-input" type="date" value={date} onChange={e => setDate(e.target.value)} max="2026-09-14" required /></label><div className="sl-unit"><span>Units</span><div className="sl-segment" aria-label="Measurement units"><button type="button" aria-pressed={unit === 'metric'} onClick={() => switchUnit('metric')}>cm / kg</button><button type="button" aria-pressed={unit === 'imperial'} onClick={() => switchUnit('imperial')}>in / lb</button></div></div></div>
      <div className="sl-measure-layout">
        <section className="cx-card sl-guide" aria-label="Measurement guide"><div className="sl-guide-heading"><span className="sl-eyebrow">WHERE TO MEASURE</span><span className="sl-small">Tap a point</span></div><div className="sl-guide-inner"><BodyDiagram selected={selected} onSelect={select} requested={requested} /><div className="sl-guide-note" aria-live="polite"><span className="sl-guide-number">{String(fields.findIndex(f => f.id === selected) + 1).padStart(2, '0')}</span><h2>{field.label}</h2><p>{field.hint}</p><span className="sl-small">Use a soft measuring tape.</span></div></div></section>
        <section className="sl-values" aria-label="Requested measurements"><div className="sl-section-heading"><h2>Your measurements</h2><span className="sl-small">{count} / {fields.length} added</span></div><div className="sl-field-grid">{fields.map(f => <label key={f.id} className={`sl-number-field ${selected === f.id ? 'selected' : ''}`}><span>{f.label} <span className="sl-required">*</span></span><div><input ref={el => refs.current[f.id] = el} aria-label={f.label} type="number" inputMode="decimal" min="0.1" max="999" step="0.1" placeholder="—" required value={values[f.id] || ''} onFocus={() => setSelected(f.id)} onChange={e => setValues({ ...values, [f.id]: e.target.value })} /><span>{unit === 'metric' ? 'cm' : 'in'}</span></div></label>)}<label className="sl-number-field"><span>Body weight <span className="sl-optional">Optional</span></span><div><input aria-label="Body weight" type="number" inputMode="decimal" min="0.1" max="999" step="0.1" placeholder="—" value={values.weight || ''} onChange={e => setValues({ ...values, weight: e.target.value })} /><span>{unit === 'metric' ? 'kg' : 'lb'}</span></div></label></div><p className="sl-small sl-field-help">* Requested by your coach. Measure without pulling the tape tight.</p></section>
      </div>
      {error && <p role="alert" className="sl-error">{error}</p>}
      <div className="sl-privacy-note"><Lock /><span>Shared with Coach Sam. Your previous measurements aren’t shown on this link.</span></div>
    </main>
    <footer className="sl-action-footer"><span className="sl-small">Ready when you are.</span><button type="submit" className="cx-btn cx-btn-primary"><Icon.Send size={17} /> Send measurements</button></footer>
  </form></>;
}

function Workout({ result, onSubmit, onCoach, onAgain }) {
  const [statuses, setStatuses] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [actuals, setActuals] = useState({});
  const [note, setNote] = useState('');
  const done = Object.values(statuses).filter(v => v === 'done').length;
  const skipped = Object.values(statuses).filter(v => v === 'skipped').length;
  if (result) return <Receipt kind="workout" result={result} onCoach={onCoach} onAgain={onAgain} />;
  return <><GuestHeader /><main className="sl-guest-main sl-workout-main"><CoachByline /><PageIntro eyebrow="MONDAY, 14 SEPTEMBER" title="Your push day.">Hi Alex. Follow your coach’s plan and tick off each exercise.</PageIntro>
    <div className="cx-card sl-workout-summary"><div><span className="sl-eyebrow">TODAY’S PLAN</span><strong>Chest · Shoulders · Triceps</strong><span className="sl-small">5 exercises · 15 sets · Rest 60–90 sec between sets</span></div><Tag>Push</Tag></div>
    <div className="sl-progress-label"><strong>{done} of 5 complete</strong><span className="sl-small">{skipped ? `${skipped} skipped` : 'One exercise at a time'}</span></div><div className="sl-progress" role="progressbar" aria-label="Exercises completed" aria-valuenow={done} aria-valuemin="0" aria-valuemax="5"><span style={{ width: `${done * 20}%` }} /></div>
    <div className="sl-exercises">{EXERCISES.map((ex, index) => <article className={`cx-card sl-exercise ${statuses[ex.id] === 'done' ? 'is-done' : ''}`} key={ex.id}>
      <div className="sl-exercise-top"><button className="sl-complete" type="button" role="checkbox" aria-checked={statuses[ex.id] === 'done'} aria-label={`Complete ${ex.name}`} onClick={() => setStatuses({ ...statuses, [ex.id]: statuses[ex.id] === 'done' ? 'pending' : 'done' })}>{statuses[ex.id] === 'done' ? <Icon.Check size={19} /> : <span>{String(index + 1).padStart(2, '0')}</span>}</button><div className="sl-exercise-info"><h2>{ex.name}</h2><div className="sl-prescription"><span><b>{ex.sets}</b> sets</span><span><b>{ex.reps}</b> reps</span><span className="sl-target"><b>{ex.weight}</b> kg target</span></div></div></div>
      <p className="sl-exercise-note">{ex.note}</p><div className="sl-exercise-actions"><button type="button" className="sl-text-button" aria-expanded={expanded === ex.id} onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}>{actuals[ex.id] ? `Used ${actuals[ex.id]} kg` : 'Used a different weight?'}<Icon.Down size={12} /></button><button type="button" className="sl-text-button" onClick={() => setStatuses({ ...statuses, [ex.id]: statuses[ex.id] === 'skipped' || statuses[ex.id] === 'done' ? 'pending' : 'skipped' })}>{statuses[ex.id] === 'skipped' ? 'Skipped · Undo' : statuses[ex.id] === 'done' ? 'Undo' : 'Skip'}</button></div>
      {expanded === ex.id && <label className="sl-actual">Weight you used (kg)<input className="cx-input" aria-label={`Actual weight for ${ex.name}`} type="number" inputMode="decimal" min="0" step="0.5" placeholder={ex.weight} value={actuals[ex.id] || ''} onChange={e => setActuals({ ...actuals, [ex.id]: e.target.value })} /></label>}
    </article>)}</div>
    <label className="cx-field sl-workout-note"><span className="sl-section-heading"><h2>How did it feel?</h2><span className="sl-small">Optional</span></span><textarea className="cx-textarea" rows="3" maxLength="500" placeholder="Anything you’d like your coach to know…" value={note} onChange={e => setNote(e.target.value)} /></label><p className="sl-small sl-self-report">Your checkmarks tell your coach what you completed. Actual weights are optional.</p>
  </main><footer className="sl-action-footer"><span className="sl-small">{done} complete{skipped ? ` · ${skipped} skipped` : ''}</span><Button variant="primary" icon={<Icon.Check size={17} />} disabled={done + skipped === 0} onClick={() => onSubmit({ done, skipped, statuses, actuals, note })}>{done === 5 ? 'Finish workout' : 'Send progress'}</Button></footer></>;
}

function ShareDialog({ kind, requested, setRequested, onClose, onPreview, notify }) {
  const dialog = useRef(null);
  const isBody = kind === 'measurements';
  const [stage, setStage] = useState('configure');
  const [expires, setExpires] = useState('7');
  useEffect(() => { dialog.current.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="sl-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="sl-dialog-inner"><div className="sl-dialog-heading"><div><span className="sl-eyebrow">ALEX MORGAN</span><h2>{isBody ? 'Request measurements' : 'Share workout'}</h2></div><Button icon={<Icon.Close size={18} />} aria-label="Close sharing dialog" onClick={onClose} /></div>
    {stage === 'configure' ? <><p className="sl-small">{isBody ? 'Choose what Alex should measure. The link opens a simple form in their browser.' : 'Share a dated workout with the sets, reps and target weights you’ve assigned.'}</p>{isBody ? <div className="sl-request-fields">{FIELDS.map(f => <Checkbox key={f.id} checked={requested.includes(f.id)} onChange={checked => setRequested(checked ? [...requested, f.id] : requested.filter(id => id !== f.id))}>{f.label}</Checkbox>)}<span className="sl-small">Body weight is included as an optional field.</span></div> : <div className="cx-card sl-assignment"><strong>Monday, 14 September</strong><span>Push · 5 exercises · 15 sets</span><span className="sl-small">The shared workout keeps this version of your plan.</span></div>}<label className="cx-field"><span className="cx-label">Link expires after</span><select className="cx-select" value={expires} onChange={e => setExpires(e.target.value)}><option value="2">2 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label><Button block variant="primary" disabled={isBody && !requested.length} onClick={() => setStage('ready')}>Create link <Icon.Link size={16} /></Button></> : <><div className="sl-ready"><Icon.Check size={16} /><span>Private link ready · Expires in {expires} days</span></div><div className="sl-link-placeholder"><Lock /><span>theryn.fit/s/{kind}/••••••••</span></div><div className="sl-message-preview">Hi Alex, {isBody ? 'please send me your body measurements using this link.' : 'here’s your workout for Monday. Tick off your exercises and send me your progress.'} It opens in your browser — no app needed.</div><div className="sl-share-options"><Button variant="primary" icon={<Icon.Messages size={17} />} onClick={() => notify('WhatsApp sharing preview — no message was sent.')}>WhatsApp</Button><Button icon={<Icon.Share size={17} />} onClick={() => notify('The phone or browser share sheet opens here in the finished feature.')}>More apps</Button><Button icon={<Icon.Copy size={17} />} onClick={() => notify('Copy link preview — this mockup does not create an active link.')}>Copy link</Button></div><Button block onClick={() => onPreview(kind)}>Preview client page <Icon.Chevron size={16} /></Button><button className="sl-text-button sl-revoke" onClick={() => { notify('Preview link revoked.'); onClose(); }}>Revoke link</button></>}
    <p className="sl-small sl-dialog-demo">Design preview · Sharing is simulated.</p>
  </div></dialog>;
}

function Coach({ measurements, workout, requested, setRequested, onPreview, notify }) {
  const [dialog, setDialog] = useState(null);
  const [tab, setTab] = useState('body');
  return <><header className="sl-header"><Brand /><div className="sl-coach-nav"><span className="active">Clients</span><span>Plans</span><span>Payments</span><span>Messages</span></div><Avatar name="Sam Taylor" size="sm" /></header><main className="sl-coach-main"><div className="sl-breadcrumb"><span>Clients</span><Icon.Chevron size={14} /><span>Alex Morgan</span></div><div className="sl-client-head"><Avatar name="Alex Morgan" size="lg" /><div><h1>Alex Morgan</h1><span className="sl-small">Added by you · Client since September 2026</span></div><Tag>Not on app</Tag></div><p className="sl-client-description">Keep Alex’s progress in Theryn. Send a private link for their next check-in.</p>
    <div className="sl-coach-actions"><Button variant="primary" icon={<Icon.Link size={16} />} onClick={() => setDialog('measurements')}>Request measurements</Button><Button icon={<Icon.Share size={16} />} onClick={() => setDialog('workout')}>Share workout</Button></div>
    <div className="sl-coach-stats"><div className="cx-card"><span className="sl-small">Latest measurements</span><strong>{measurements ? 'Just received' : 'Awaiting check-in'}</strong><span className="sl-small">{measurements ? 'Submitted via private link' : 'No measurements submitted yet'}</span></div><div className="cx-card"><span className="sl-small">Monday’s workout</span><strong>{workout ? `${workout.done} of 5 complete` : 'Ready to share'}</strong><span className="sl-small">{workout ? 'Self-reported via private link' : 'Push · 5 exercises'}</span></div></div>
    <Tabs tabs={[{ id: 'body', label: 'Body' }, { id: 'plan', label: 'Plan' }, { id: 'activity', label: 'Check-ins' }]} value={tab} onChange={setTab} />
    {tab === 'body' ? <section className="sl-coach-section"><div className="sl-section-heading"><h2>Body measurements</h2><Tag>{measurements ? 'Via link' : 'No entries yet'}</Tag></div>{measurements ? <><p className="sl-small">Measured {measurements.date} · Received just now</p><div className="sl-result-grid">{[...FIELDS, { id: 'weight', label: 'Body weight' }].filter(f => measurements.values[f.id]).map(f => <div className="cx-card" key={f.id}><span className="sl-small">{f.label}</span><strong>{measurements.values[f.id]} <small>{f.id === 'weight' ? (measurements.unit === 'metric' ? 'kg' : 'lb') : (measurements.unit === 'metric' ? 'cm' : 'in')}</small></strong></div>)}</div></> : <div className="cx-card sl-empty-state"><span className="sl-empty-icon"><Icon.Person size={26} /></span><h2>A first check-in starts here.</h2><p>Alex can send measurements from their browser.<br />They don’t need to download Theryn.</p><Button onClick={() => setDialog('measurements')}>Request measurements <Icon.Chevron size={16} /></Button></div>}</section> : tab === 'plan' ? <section className="sl-coach-section"><div className="sl-section-heading"><h2>Monday · Push</h2><Tag active={Boolean(workout)}>{workout ? 'Progress received' : 'Assigned'}</Tag></div><div className="cx-card sl-plan-list">{EXERCISES.map(ex => <div key={ex.id}><span>{ex.name}</span><span>{ex.sets} × {ex.reps} · <b>{ex.weight} kg</b></span>{workout && <><span className="sl-small">{workout.actuals[ex.id] ? `Used ${workout.actuals[ex.id]} kg` : ''}</span><Tag active={workout.statuses[ex.id] === 'done'}>{workout.statuses[ex.id] === 'done' ? 'Done' : workout.statuses[ex.id] === 'skipped' ? 'Skipped' : 'Not completed'}</Tag></>}</div>)}</div>{workout?.note && <div className="cx-card sl-assignment"><span className="sl-small">Alex’s feedback</span><p>{workout.note}</p></div>}<Button onClick={() => setDialog('workout')} icon={<Icon.Share size={16} />}>Share this workout</Button></section> : <section className="sl-coach-section"><h2>Recent check-ins</h2>{!measurements && !workout ? <p className="sl-small">Submitted measurements and workouts will appear here.</p> : <>{measurements && <div className="cx-card sl-activity"><Icon.Check size={18} /><div><strong>Body measurements received</strong><span>Just now · Via private link</span></div></div>}{workout && <div className="cx-card sl-activity"><Icon.Check size={18} /><div><strong>Workout progress received</strong><span>{workout.done} completed · {workout.skipped} skipped · Self-reported</span></div></div>}</>}</section>}
  </main>{dialog && <ShareDialog kind={dialog} requested={requested} setRequested={setRequested} onClose={() => setDialog(null)} onPreview={screen => { setDialog(null); onPreview(screen); }} notify={notify} />}</>;
}

export default function Preview() {
  const initial = new URLSearchParams(location.search).get('screen');
  const [screen, setScreen] = useState(SCREEN_TABS.some(t => t.id === initial) ? initial : 'measurements');
  const [device, setDevice] = useState(new URLSearchParams(location.search).get('device') === 'desktop' ? 'desktop' : 'mobile');
  const [requested, setRequested] = useState(FIELDS.map(f => f.id));
  const [measurements, setMeasurements] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [reset, setReset] = useState(0);
  const [toast, setToast] = useState('');
  const scroll = useRef(null);
  useEffect(() => { scroll.current?.scrollTo(0, 0); const url = new URL(location.href); url.searchParams.set('screen', screen); url.searchParams.set('device', device); history.replaceState(null, '', url); }, [screen, device, measurements, workout]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4200); return () => clearTimeout(id); }, [toast]);
  const restart = () => { setMeasurements(null); setWorkout(null); setRequested(FIELDS.map(f => f.id)); setReset(v => v + 1); setToast('Preview reset. All sample entries cleared.'); };
  return <div className="cx-app sl-preview"><header className="sl-preview-bar"><div className="sl-preview-title"><span className="sl-preview-dot" /><strong>Shared links</strong><span>Design preview</span></div><nav aria-label="Preview screens"><Tabs tabs={SCREEN_TABS} value={screen} onChange={setScreen} /></nav><div className="sl-preview-tools"><div className="sl-segment" aria-label="Preview width"><button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>Mobile</button><button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Desktop</button></div><Button size="sm" onClick={restart}>Reset</Button></div></header><div className="sl-preview-note">Interactive mockup · Sample data only · Nothing is sent or saved</div><div className={`sl-stage ${device}`}><div className="sl-browser-bar"><Lock /><span>theryn.fit{screen === 'coach' ? ' / clients / Alex' : ` / s / ${screen}`}</span></div><div className="sl-product" ref={scroll}><div className="sl-product-content" key={`${screen}-${reset}`}>{screen === 'coach' ? <Coach measurements={measurements} workout={workout} requested={requested} setRequested={setRequested} onPreview={setScreen} notify={setToast} /> : screen === 'measurements' ? <Measurements requested={requested} result={measurements} onSubmit={setMeasurements} onCoach={() => setScreen('coach')} onAgain={() => { setMeasurements(null); setReset(v => v + 1); }} /> : <Workout result={workout} onSubmit={setWorkout} onCoach={() => setScreen('coach')} onAgain={() => { setWorkout(null); setReset(v => v + 1); }} />}</div></div></div>{toast && <div className="sl-toast" role="status">{toast}</div>}</div>;
}

