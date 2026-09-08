import React from "react";
import { Sheet, Button, Checkbox, Icon, useToast } from "../ui/primitives.jsx";
import { buildPlanSheets, buildPlanWorkbook, deliverWorkbook, planFileName } from "../lib/exportPlan.ts";
import { useCoachData } from "../data/CoachDataContext.jsx";

/**
 * Shows the sheet before it is downloaded, with two plain options. Web
 * downloads the file; iOS/Android open the share sheet.
 */
export default function ExportExcelDialog({ open, onClose, name, templates, history, unit = "lb", subject = "client" }) {
  const data = useCoachData();
  const toast = useToast();
  const isPlan = subject === "plan";
  const [includeLastWeights, setIncludeLastWeights] = React.useState(true);
  const [blankColumns, setBlankColumns] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (open) { setActive(0); setBusy(false); } }, [open]);

  const useWeights = includeLastWeights && !isPlan && Boolean(history);
  const sheets = React.useMemo(
    () => (open && templates ? buildPlanSheets(templates, { includeLastWeights: useWeights, blankColumns, history, unit }) : []),
    [open, templates, useWeights, blankColumns, history, unit],
  );
  const filename = planFileName(name);
  const firstName = isPlan ? "the client" : (name || "them").split(" ")[0];
  const title = isPlan ? `Export "${name}" to Excel` : `Export ${firstName}'s plan to Excel`;

  async function go() {
    setBusy(true);
    try {
      const bytes = await buildPlanWorkbook(templates, { includeLastWeights: useWeights, blankColumns, history, unit });
      const result = await deliverWorkbook(bytes, filename, data.isNative);
      if (result === "downloaded") toast(`Downloaded ${filename}`);
      else if (result === "shared") toast("Shared");
      onClose();
    } catch (e) {
      toast(`Export failed: ${e.message || e}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const sheet = sheets[active];
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="One sheet per training day. Opens in Excel, Numbers, or Google Sheets." wide>
      {sheets.length === 0 ? (
        <div className="cx-empty">This plan has no training days with exercises yet.</div>
      ) : (
        <>
          <div className="cx-xl-tabs" role="tablist">
            {sheets.map((s, i) => <button key={s.name} type="button" role="tab" aria-selected={i === active} className="cx-xl-tab" onClick={() => setActive(i)}>{s.name.replace(" - ", " · ")}</button>)}
          </div>
          <div className="cx-xl-scroll">
            <div className="cx-xl" style={{ minWidth: blankColumns ? 760 : 520 }}>
              {sheet.rows.slice(0, 9).map((row, ri) => (
                <div key={ri} className="cx-xl-row" style={blankColumns ? { gridTemplateColumns: "28px minmax(0,1fr) 44px 48px 64px minmax(0,1fr) 60px 60px 70px 80px" } : undefined}>
                  {row.map((cell, ci) => <div key={ci}>{cell === "" ? "" : String(cell)}</div>)}
                </div>
              ))}
              {sheet.rows.length > 9 && <div className="cx-xl-row"><div /><div style={{ color: "#6B7062" }}>… {sheet.rows.length - 9} more rows</div><div /><div /><div /><div /></div>}
            </div>
          </div>
        </>
      )}

      <div className="cx-col" style={{ marginTop: 14 }}>
        {!isPlan && <Checkbox checked={includeLastWeights} onChange={setIncludeLastWeights}>Include the weights {firstName} last lifted</Checkbox>}
        <Checkbox checked={blankColumns} onChange={setBlankColumns}>Add empty columns for {firstName} to write in what they did</Checkbox>
      </div>

      <div className="cx-actions-2" style={{ marginTop: 16 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={data.isNative ? <Icon.Share /> : <Icon.Download />} onClick={go} disabled={busy || sheets.length === 0}>
          {busy ? "Preparing…" : data.isNative ? "Share file" : `Download ${filename}`}
        </Button>
      </div>
    </Sheet>
  );
}
