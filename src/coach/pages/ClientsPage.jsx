import React from "react";
import { Avatar, Chip, Icon, Tone, Empty, Button, useViewport } from "../ui/primitives.jsx";
import { lastWorkoutLabel, lastWorkoutTone, weekProgress, whatToDo, paymentFact, attentionBucket, sortClients } from "../lib/clientFacts.js";
import { plural } from "../lib/format.js";
import ClientDetail from "./ClientDetail.jsx";

/**
 * Home: every client as a row (table) or card (phone), with the selected
 * client open beside the table on laptop, in a drawer on tablet, or as a full
 * page on phone.
 */
export default function ClientsPage({ clients, cache, selectedId, onSelect, fees, payments, defaultCurrency, search, actions, detailTab, onDetailTab }) {
  const vp = useViewport();
  const [filter, setFilter] = React.useState("all");

  // Load every client's data so the four facts can be computed. De-duplicated by the cache.
  React.useEffect(() => {
    for (const c of clients) cache.load(c.athlete_id).catch(() => {});
  }, [clients, cache]);

  const rows = React.useMemo(() => {
    const now = new Date();
    const list = clients.map((link) => {
      const data = cache.get(link.athlete_id);
      const fee = fees.find((f) => f.athlete_id === link.athlete_id) || null;
      const pays = payments.filter((p) => p.athlete_id === link.athlete_id);
      const payment = paymentFact(fee, pays, defaultCurrency, now);
      if (!data) return { link, name: link.athlete_name, loading: true, payment, bucket: "ok" };
      if (link.manual) {
        const hasPlan = data.routine && Object.values(data.routine).some((d) => d?.type && d.type !== "Rest" && d.exercises?.length);
        const todo = { text: hasPlan ? "Not on the app yet. Export their plan to Excel, or share your code so they can join." : "Not on the app yet. Build their plan, or share your code so they can join.", severity: null, tab: "plan", color: null };
        const row = { link, name: link.athlete_name, loading: false, data, last: null, lastTone: "muted", week: null, todo, payment, manual: true };
        row.bucket = payment.status === "overdue" || payment.status === "due" ? "payment" : "ok";
        return row;
      }
      const todo = whatToDo(data, now);
      const row = {
        link, name: link.athlete_name, loading: false, data,
        last: lastWorkoutLabel(data.history, now), lastTone: lastWorkoutTone(data.history, now),
        week: weekProgress(data.history, data.routine, now), todo, payment,
      };
      row.bucket = attentionBucket(row, now);
      return row;
    });
    return sortClients(list);
  }, [clients, cache.version, fees, payments, defaultCurrency]);

  const counts = React.useMemo(() => ({
    attention: rows.filter((r) => r.bucket === "attention").length,
    payment: rows.filter((r) => r.payment?.status === "overdue" || r.payment?.status === "due").length,
    ok: rows.filter((r) => r.bucket === "ok").length,
  }), [rows]);

  const q = (search || "").trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (q && !(r.name || "").toLowerCase().includes(q)) return false;
    if (filter === "attention") return r.bucket === "attention";
    if (filter === "payment") return r.payment?.status === "overdue" || r.payment?.status === "due";
    if (filter === "ok") return r.bucket === "ok";
    return true;
  });

  const selected = selectedId ? rows.find((r) => r.link.athlete_id === selectedId) : null;

  // Phone: a selected client takes over the screen.
  if (vp === "phone" && selected) {
    return (
      <div className="cx-page" style={{ paddingTop: 8 }}>
        <button type="button" className="cx-back" onClick={() => onSelect(null)}><Icon.Back /> Clients</button>
        <ClientDetail row={selected} actions={actions} defaultCurrency={defaultCurrency} fees={fees} payments={payments} tab={detailTab} onTab={onDetailTab} />
      </div>
    );
  }

  const list = (
    <>
      <div className="cx-page-head">
        <div>
          <h1 className="cx-h1">{plural(clients.length, "client")}</h1>
          {counts.attention > 0
            ? <div className="cx-sub">{counts.attention === 1 ? "1 client needs attention." : `${counts.attention} clients need attention.`}</div>
            : <div className="cx-sub">Everyone is on track.</div>}
        </div>
        <div className="cx-chips" role="group" aria-label="Filter clients">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          <Chip active={filter === "attention"} onClick={() => setFilter("attention")}>{counts.attention} need attention</Chip>
          <Chip active={filter === "payment"} onClick={() => setFilter("payment")}>{counts.payment} payments due</Chip>
          <Chip active={filter === "ok"} onClick={() => setFilter("ok")}>{counts.ok} on track</Chip>
        </div>
      </div>

      {clients.length === 0 ? (
        <Empty title="No clients yet" action={<Button variant="primary" onClick={actions.addClient} icon={<Icon.Plus />}>Add your first client</Button>}>
          Share your invite code and your client appears here once they join.
        </Empty>
      ) : visible.length === 0 ? (
        <Empty title="Nothing here">No clients match this filter{q ? ` or search` : ""}.</Empty>
      ) : (
        <>
          <div className="cx-card cx-table">
            <div className="cx-thead" aria-hidden="true">
              <div>Client</div><div>Last workout</div><div className="cx-col-week">This week</div><div className="cx-col-pay">Payment</div><div>What to do</div><div />
            </div>
            {visible.map((r) => <TableRow key={r.link.athlete_id} row={r} selected={r.link.athlete_id === selectedId} onClick={() => onSelect(r.link.athlete_id)} />)}
          </div>
          <div className="cx-cards">
            {visible.map((r) => <CardRow key={r.link.athlete_id} row={r} onClick={() => onSelect(r.link.athlete_id)} />)}
          </div>
        </>
      )}
    </>
  );

  if (vp === "laptop") {
    return (
      <div className="cx-split">
        <div className="cx-split-main">{list}</div>
        <aside className="cx-panel" aria-label="Selected client">
          {selected
            ? <ClientDetail row={selected} actions={actions} defaultCurrency={defaultCurrency} fees={fees} payments={payments} tab={detailTab} onTab={onDetailTab} onClose={() => onSelect(null)} />
            : <Empty title="Pick a client">Click a row to see their plan, progress, body data, and payments here.</Empty>}
        </aside>
      </div>
    );
  }

  // Tablet: drawer over the table.
  return (
    <div className="cx-page">
      {list}
      {selected && (
        <>
          <div className="cx-drawer-backdrop" onClick={() => onSelect(null)} />
          <div className="cx-drawer" role="dialog" aria-label={selected.name}>
            <ClientDetail row={selected} actions={actions} defaultCurrency={defaultCurrency} fees={fees} payments={payments} tab={detailTab} onTab={onDetailTab} onClose={() => onSelect(null)} />
          </div>
        </>
      )}
    </div>
  );
}

function WeekSquares({ week }) {
  if (!week) return <span className="cx-muted">—</span>;
  const planned = week.days.filter((d) => d.planned);
  return (
    <span className="cx-week" aria-label={`${week.done} of ${week.planned} planned workouts done this week`}>
      {planned.map((d) => <i key={d.key} className={d.done ? "done" : d.missed ? "missed" : ""} title={`${d.key}${d.done ? " done" : d.missed ? " missed" : ""}`} />)}
      <span>{week.done} of {week.planned}</span>
    </span>
  );
}

function Skeleton({ w = 80 }) { return <span className="cx-skel" style={{ display: "inline-block", width: w, height: 14 }} />; }

function TableRow({ row, selected, onClick }) {
  const pay = row.payment;
  return (
    <button type="button" className="cx-trow" aria-selected={selected} onClick={onClick}>
      <div className="name"><Avatar name={row.name} size="sm" /><div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span>{row.name}</span>{row.manual && <span className="cx-tag" style={{ alignSelf: "flex-start" }} title="Added by name; they haven't joined the app">Not on app</span>}</div></div>
      <div>{row.loading ? <Skeleton w={70} /> : row.manual ? <span className="cx-muted">—</span> : <Tone tone={row.lastTone}>{row.last}</Tone>}</div>
      <div className="cx-col-week">{row.loading ? <Skeleton w={90} /> : <WeekSquares week={row.week} />}</div>
      <div className="cx-col-pay"><Tone tone={pay.tone}>{pay.label}</Tone></div>
      <div className={`todo ${row.todo?.severity ? "" : "ok"}`}>{row.loading ? <Skeleton w={160} /> : row.todo.text}</div>
      <div className="chev"><Icon.Chevron /></div>
    </button>
  );
}

function CardRow({ row, onClick }) {
  const pay = row.payment;
  return (
    <button type="button" className="cx-client-card" onClick={onClick}>
      <div className="row">
        <Avatar name={row.name} />
        <div className="name">{row.name}</div>
        {row.manual && <span className="cx-tag">Not on app</span>}
        <Icon.Chevron />
      </div>
      <div className="facts">
        <div><span className="k">Last workout</span>{row.loading ? <Skeleton w={60} /> : row.manual ? <span className="cx-muted">—</span> : <Tone tone={row.lastTone}>{row.last}</Tone>}</div>
        <div><span className="k">This week</span>{row.loading ? <Skeleton w={60} /> : <WeekSquares week={row.week} />}</div>
        <div><span className="k">Payment</span><Tone tone={pay.tone}>{pay.label}</Tone></div>
      </div>
      {!row.loading && (row.todo?.severity || row.manual) && <div className={`todo ${row.manual ? "cx-muted" : ""}`}>{row.todo.text}</div>}
    </button>
  );
}
