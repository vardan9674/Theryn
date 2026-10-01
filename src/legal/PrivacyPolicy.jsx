import React from "react";
import LegalPage, { H2, P, UL, A, legalStyles } from "./LegalPage.jsx";
import { LEGAL, fact } from "./legalConfig.js";

// Plain-language privacy policy. Written to cover the App Store and Google Play
// requirements, the EU/UK GDPR, the California CCPA/CPRA and India's DPDP Act.
// It describes what the code actually does; when the code changes what it
// collects or who it shares with, change this page in the same pull request.
// Have it reviewed by a lawyer before the first store release.

export default function PrivacyPolicy({ onClose }) {
  const email = fact("contactEmail");
  const mail = email === "[to be added]" ? null : `mailto:${email}`;
  return (
    <LegalPage title="Privacy policy" updated={`Effective ${LEGAL.effectiveDate}`} onClose={onClose}>
      <div style={legalStyles.card}>
        <P><b>The short version.</b> Theryn stores what you log so you and your coach can use it. We don't sell your data, we don't show ads, we don't use tracking or analytics tools, and you can delete your account and everything in it from inside the app at any time.</P>
      </div>

      <H2>Who we are</H2>
      <P>Theryn is run by {fact("operatorName")}, {fact("operatorAddress")} ("we", "us"). For anything about your data, email {mail ? <A href={mail}>{email}</A> : email}.</P>
      <P>This policy covers the Theryn apps for iPhone, iPad and Android, the website at {LEGAL.website}, the coach dashboard, and the workout links coaches send their clients.</P>

      <H2>What we collect</H2>
      <UL items={[
        <><b>Account details.</b> Your name, email address and profile picture, which come from Google or Apple when you sign in. With Sign in with Apple you can hide your email; we then get a private relay address instead.</>,
        <><b>Training data.</b> Your plan, the workouts and sets you log (exercises, weights, reps, times, notes, how hard it felt), personal bests and streaks.</>,
        <><b>Body data.</b> Height, body weight and body measurements, if you choose to enter them. This is health information, so we only collect it when you type it in, and only use it to show your progress to you and your coach.</>,
        <><b>Messages.</b> Messages between you and your coach, and the weekly reports a coach shares with you.</>,
        <><b>Coach records.</b> If you are a coach: your clients' names, the plans you write, the workouts you log for them, and the fees and payments you record. Theryn does not process payments; these are your own notes.</>,
        <><b>Settings.</b> Units, time zone, notification choices, equipment you have, and your role (athlete or coach).</>,
        <><b>Device details for notifications.</b> If you allow notifications, a push token from Apple or Google so we can send them to your device.</>,
        <><b>Reports you send us.</b> If you tell us an exercise lists the wrong muscle, we keep that report.</>,
      ]} />
      <P>We do not collect your location, contacts, photos, advertising identifier or browsing history, and we do not read data from Apple Health or Google Fit.</P>

      <H2>Workout links (clients without an account)</H2>
      <P>A coach can add a client by name and send them a private link. Anyone who has that link can see the plan and send workouts and measurements through it, so keep it to yourself. What a client sends through a link is stored for their coach. For those clients, the coach decides what is collected and we handle it for the coach. To have it changed or removed, ask your coach, or email us and we'll pass it on.</P>

      <H2>Why we use it</H2>
      <UL items={[
        "To run Theryn: show your plan, save your workouts, chart your progress, and let you and your coach see the same thing.",
        "To send the notifications you've turned on, such as a message from your coach or a workout reminder.",
        "To keep Theryn secure and working: preventing abuse, fixing errors, and keeping backups.",
        "To answer you when you contact us.",
      ]} />
      <P>We never use your data for advertising, never sell or rent it, and never share it for cross-app tracking. We don't build profiles about you for any purpose other than running the app.</P>
      <P><b>Legal bases (EU and UK).</b> Running the service you asked for (contract); your explicit consent for body data, which you give by entering it and can withdraw by deleting it; and our legitimate interest in keeping Theryn secure. In India we process personal data on the basis of your consent under the Digital Personal Data Protection Act, 2023.</P>

      <H2>Who can see your data</H2>
      <UL items={[
        <><b>Your coach</b>, once you connect to them: your plan, workouts, body data, messages and reports. A coach you disconnect from loses access.</>,
        <><b>Your clients</b>, if you are a coach: the plans and reports you share with them, and your messages.</>,
        <><b>Our service providers</b>, who process data only on our instructions: Supabase (database, sign-in and server functions; data stored in {fact("dataRegion")}), Vercel (hosting the website), Google (Google sign-in and Firebase Cloud Messaging for Android and iOS notifications), and Apple (Sign in with Apple and notifications on Apple devices).</>,
        <><b>Others</b>, only if the law requires it, or to protect someone's safety.</>,
      ]} />
      <P>The website loads its fonts from Google Fonts and currency exchange rates from frankfurter.dev, which see your IP address but no account data. Sharing a link through WhatsApp or another app only happens when you choose to.</P>

      <H2>Where your data is stored</H2>
      <P>Your data is stored by Supabase in {fact("dataRegion")}. Our providers may handle it in other countries. When data leaves the EU, UK or India, we rely on the providers' standard contractual clauses or other safeguards the law allows.</P>

      <H2>How long we keep it</H2>
      <P>As long as you have an account. When you delete your account, your data is deleted from the live database straight away and from our backups within 30 days. Clients a coach added by name are kept until the coach removes them or deletes their own account.</P>

      <H2>Your choices and rights</H2>
      <UL items={[
        <><b>Delete your account</b>: in the app under Profile → Delete account, in the coach dashboard under You → Delete account, or at <A href="/delete-account">{LEGAL.website.replace(/^https?:\/\//, "")}/delete-account</A>. This removes your account and everything stored under it.</>,
        <><b>See, correct or get a copy</b> of your data: most of it is visible and editable in the app. For a full copy, email us.</>,
        <><b>Withdraw consent</b> to body data at any time by deleting those entries.</>,
        <><b>Turn off notifications</b> in the app or in your phone's settings.</>,
        <><b>Complain</b> to your local data protection authority (for example the ICO in the UK, your EU supervisory authority, or the Data Protection Board of India).</>,
      ]} />
      <P>California residents have the rights to know, delete and correct personal information, and to not be discriminated against for using them. We don't sell or share personal information as the CCPA defines it. To use any right, email us; we'll answer within 30 days and may ask you to confirm it's your account.</P>

      <H2>Security</H2>
      <P>Data travels over encrypted connections, and the database only lets each person reach their own data and the data people have shared with them. Your sign-in is kept on your device, and the Android app keeps it out of cloud backups. No system is perfectly secure; if a breach affects you, we'll tell you as the law requires.</P>

      <H2>Children</H2>
      <P>Theryn is for people aged {LEGAL.minimumAge} and over. We don't knowingly collect data from children under {LEGAL.minimumAge}. If you think a child has an account, email us and we'll delete it.</P>

      <H2>Health information</H2>
      <P>Theryn is a training log, not a medical service. Body weight, measurements and BMI are shown for your own tracking and are not a diagnosis.</P>

      <H2>Changes</H2>
      <P>If we change this policy, we'll update the date above. If a change affects how we use data you've already given us, we'll tell you in the app before it applies.</P>

      <H2>Contact</H2>
      <P>{fact("operatorName")}, {fact("operatorAddress")} · {mail ? <A href={mail}>{email}</A> : email}</P>
    </LegalPage>
  );
}
