import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMockCoachData } from '../coach/data/mockCoachData.js';
import { CoachDataProvider, useClientDataCache } from '../coach/data/CoachDataContext.jsx';
import { ToastProvider } from '../coach/ui/primitives.jsx';
import PlanEditor from '../coach/pages/PlanEditor.jsx';
import PlansPage from '../coach/pages/PlansPage.jsx';
import ClientsPage from '../coach/pages/ClientsPage.jsx';
import '../index.css';
import '../coach/coach.css';

const noop = () => {};

// Embedded in the landing page: the sample app must never scroll the page
// around it. Browsers pass scrollIntoView and focus scrolling up to the
// parent, which yanked visitors to another section when a preview loaded.
if (window.parent !== window) {
  Element.prototype.scrollIntoView = noop;
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options) { focus.call(this, { ...options, preventScroll: true }); };
}

function Preview() {
  const data = useMemo(createMockCoachData, []);
  const cache = useClientDataCache(data);
  const [clients, setClients] = useState([]);
  const [plan, setPlan] = useState(null);
  const screen = new URLSearchParams(location.search).get('screen');
  useEffect(() => { let alive = true; data.loadClients().then(async list => {
    const first = await data.loadClientData(list[0].athlete_id);
    if (alive) { setClients(list); setPlan(first.routine); }
  }); return () => { alive = false; }; }, [data]);
  return <CoachDataProvider value={data}><ToastProvider><div className="cx-app" style={{ minHeight:'100vh', padding:16, boxSizing:'border-box' }}>
    {screen === 'plan' ? plan && <PlanEditor client={clients[0]} initialTemplates={plan} history={[]} onCancel={noop} onSaved={noop} /> : screen === 'templates' ? <PlansPage clients={clients} onExport={noop} onClientsChanged={noop} /> : <><h1 style={{ fontSize:26, margin:'8px 0 24px' }}>Your athletes</h1><ClientsPage clients={clients} cache={cache} selectedId={null} onSelect={noop} fees={[]} payments={[]} defaultCurrency="USD" search="" actions={{addClient:noop}} detailTab="plan" onDetailTab={noop}/></>}
  </div></ToastProvider></CoachDataProvider>;
}
document.documentElement.style.background='#080808';
document.body.style.margin='0';
createRoot(document.getElementById('preview-root')).render(<Preview/>);
