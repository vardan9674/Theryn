import React from "react";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import Terms from "./Terms.jsx";
import DeleteAccountPage from "./DeleteAccountPage.jsx";

// Web routes /privacy, /terms and /delete-account. The store listings point here.
export const LEGAL_PATH = /^\/(privacy|terms|delete-account)\/?$/;

export default function LegalRoute({ path }) {
  React.useEffect(() => { document.body.style.background = "#080808"; document.body.style.overflow = "auto"; document.documentElement.style.overflow = "auto"; }, []);
  if (path === "privacy") return <PrivacyPolicy />;
  if (path === "terms") return <Terms />;
  return <DeleteAccountPage />;
}
