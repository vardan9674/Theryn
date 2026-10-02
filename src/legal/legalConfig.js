// Facts the privacy policy and terms depend on. Fill every value marked
// TODO before a store release: `npm run release:check` refuses to pass while
// any of them still start with "TODO".
//
// Changing what Theryn collects, who it shares with, or where data is stored
// means updating PrivacyPolicy.jsx, ios/App/App/PrivacyInfo.xcprivacy and
// docs/store/ (App Privacy + Data safety answers) in the same change.

export const LEGAL = {
  appName: "Theryn",
  website: "https://www.theryn.fit",
  // Who runs Theryn and is responsible for the data (the "controller").
  operatorName: "TODO: legal name of the person or company that runs Theryn",
  operatorAddress: "TODO: postal address for legal notices",
  // A mailbox someone actually reads. Store reviewers and users write here.
  contactEmail: "TODO: privacy contact email, e.g. privacy@theryn.fit",
  // Law and courts for the terms, e.g. "India" / "the courts of Bengaluru".
  governingLaw: "TODO: country whose law governs the terms",
  venue: "TODO: courts that hear disputes",
  minimumAge: 16,
  effectiveDate: "1 October 2026",
  // Where the database runs. Supabase project rmzfisntgiodoadwaewx.
  dataRegion: "the United States (AWS us-west-2, Oregon)",
};

export function legalTodos() {
  return Object.entries(LEGAL).filter(([, v]) => typeof v === "string" && v.startsWith("TODO")).map(([k]) => k);
}

// Shown in place of a TODO value so a draft never reads as a real fact.
export function fact(key) {
  const v = LEGAL[key];
  return typeof v === "string" && v.startsWith("TODO") ? "[to be added]" : v;
}
