import React from "react";
import { supabase } from "../lib/supabase";
import LegalPage, { P, A, H2 } from "./LegalPage.jsx";
import DeleteAccount from "./DeleteAccount.jsx";
import { fact } from "./legalConfig.js";

// Public page at /delete-account. Google Play asks for a web address where
// people can delete their account without reinstalling the app; this is it.
// Signed in: the same two-step deletion as in the app. Signed out: how to sign
// in to delete, or how to ask by email.
export default function DeleteAccountPage() {
  const [session, setSession] = React.useState(undefined);
  const [role, setRole] = React.useState("athlete");

  React.useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!live) return;
      setSession(data?.session || null);
      const uid = data?.session?.user?.id;
      if (uid) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
        if (live && p?.role === "coach") setRole("coach");
      }
    });
    return () => { live = false; };
  }, []);

  async function signIn(provider) {
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/delete-account` } });
  }

  const email = fact("contactEmail");
  return (
    <LegalPage title="Delete your Theryn account" updated="Removes your account and everything stored under it.">
      {session === undefined ? (
        <P>Checking whether you're signed in…</P>
      ) : session ? (
        <>
          <P>Signed in as <b>{session.user.email || "your account"}</b>.</P>
          <DeleteAccount role={role} onDeleted={() => window.location.assign("/")} />
        </>
      ) : (
        <>
          <P>Sign in with the account you use in Theryn, and you'll be able to delete it here.</P>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360, margin: "8px 0 20px" }}>
            <button type="button" onClick={() => signIn("google")} style={signBtn}>Sign in with Google</button>
            <button type="button" onClick={() => signIn("apple")} style={signBtn}>Sign in with Apple</button>
          </div>
          <H2>Other ways</H2>
          <P>In the app: Profile → Delete account. In the coach dashboard: You → Delete account.</P>
          {email !== "[to be added]" && <P>Or email <A href={`mailto:${email}?subject=Delete%20my%20Theryn%20account`}>{email}</A> from the address on your account, and we'll delete it within 30 days.</P>}
        </>
      )}
      <P>See the <A href="/privacy">privacy policy</A> for what we store and how long backups are kept.</P>
    </LegalPage>
  );
}

const signBtn = { minHeight: 48, borderRadius: 999, border: "1px solid #2A2A2A", background: "#101010", color: "#F0F0F0", fontSize: 15, fontWeight: 700, cursor: "pointer" };
