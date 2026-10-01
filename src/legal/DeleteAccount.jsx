import React from "react";
import { deleteMyAccount } from "./deleteAccount.js";
import { legalStyles } from "./LegalPage.jsx";
import { fact } from "./legalConfig.js";

const C = legalStyles.colors;
const RED = "#FF5C5C";

// The delete-account confirmation, used in three places: athlete Profile,
// coach "You" sheet and the public /delete-account page. Two steps on
// purpose: read what goes, then confirm. Apple and Google both require the
// deletion itself to happen in the app, not just a "contact us" link.
export default function DeleteAccount({ role = "athlete", onCancel, onDeleted }) {
  const [step, setStep] = React.useState("explain"); // explain | confirm | working | done | error
  const [error, setError] = React.useState(null);
  const coach = role === "coach";

  async function run() {
    setStep("working");
    setError(null);
    try {
      await deleteMyAccount();
      setStep("done");
      setTimeout(() => onDeleted?.(), 1200);
    } catch (e) {
      setError(e?.message || "Something went wrong.");
      setStep("error");
    }
  }

  const goes = coach
    ? ["Your account and sign-in", "Every client you added by name, their plans, workouts, measurements and links (their links stop working)", "Your plans, templates and custom exercises", "Fees and payments you recorded", "Your messages and the weekly reports you shared", "Your connections to clients who have their own accounts (they keep their own data)"]
    : ["Your account and sign-in", "Your plan, every workout and set you logged, and your personal bests", "Your body weight, measurements and height", "Your messages with your coach and the reports they shared", "Your connection to your coach (they stop seeing your data)", "Your settings and notification tokens"];

  const email = fact("contactEmail");

  if (step === "done") {
    return (
      <div role="status" style={{ textAlign: "center", padding: "24px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Your account is deleted</div>
        <div style={{ fontSize: 15, color: C.sb }}>Everything stored under it has been removed.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 15, lineHeight: 1.55 }}>
        Deleting your account removes it for good. This can't be undone.
      </div>
      <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: C.sb, marginBottom: 8 }}>What gets deleted</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {goes.map((g) => <li key={g} style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 4 }}>{g}</li>)}
        </ul>
      </div>
      <div style={{ fontSize: 13, color: C.sb, lineHeight: 1.5 }}>
        It's removed from our live database now and from backups within 30 days.
        {!coach && " Workouts you sent to a coach through a workout link stay in your coach's records; ask them to remove those."}
        {email !== "[to be added]" && <> Questions? <a href={`mailto:${email}`} style={{ color: C.a }}>{email}</a></>}
      </div>

      {error && <div role="alert" style={{ background: "rgba(255,92,92,.1)", border: `1px solid ${RED}`, color: RED, borderRadius: 12, padding: "10px 12px", fontSize: 14 }}>{error}</div>}

      {step === "explain" ? (
        <div style={{ display: "flex", gap: 8 }}>
          {onCancel && <button type="button" onClick={onCancel} style={btn(false)}>Keep my account</button>}
          <button type="button" onClick={() => setStep("confirm")} style={btn(true)}>Delete account</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Are you sure? Your data can't be recovered.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { setStep("explain"); setError(null); }} disabled={step === "working"} style={btn(false)}>Cancel</button>
            <button type="button" onClick={run} disabled={step === "working"} style={btn(true)} aria-busy={step === "working"}>
              {step === "working" ? "Deleting…" : "Yes, delete everything"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function btn(danger) {
  return {
    flex: 1, minHeight: 48, borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: "pointer",
    background: danger ? RED : "transparent", color: danger ? "#000" : C.tx,
    border: danger ? "none" : `1px solid ${C.bd}`,
  };
}
