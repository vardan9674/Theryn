import React from "react";
import LegalPage, { H2, P, UL, A } from "./LegalPage.jsx";
import { LEGAL, fact } from "./legalConfig.js";

// Terms of use. Kept short and readable. Have it reviewed by a lawyer before
// the first store release, and fill the TODO facts in legalConfig.js.

export default function Terms({ onClose }) {
  const email = fact("contactEmail");
  const mail = email === "[to be added]" ? null : `mailto:${email}`;
  return (
    <LegalPage title="Terms of use" updated={`Effective ${LEGAL.effectiveDate}`} onClose={onClose}>
      <P>These terms are an agreement between you and {fact("operatorName")} ("we") for using Theryn: the apps, the website, the coach dashboard and workout links. By using Theryn you agree to them and to our <A href="/privacy">privacy policy</A>.</P>

      <H2>Who can use Theryn</H2>
      <P>You must be at least {LEGAL.minimumAge}. You are responsible for your account and for what happens under it. Keep workout links private; anyone with a link can use it.</P>

      <H2>Training safety</H2>
      <P>Theryn helps you plan and log training. It is not medical advice and doesn't replace a doctor or physiotherapist. Check with a doctor before starting a new programme, especially if you have an injury or a health condition, and stop if something hurts. Plans come from your coach or from you; we don't check them.</P>

      <H2>Coaches</H2>
      <UL items={[
        "You are responsible for the plans and advice you give, and for having your clients' agreement to store their details in Theryn.",
        "Fees and payments you record in Theryn are your own notes. Theryn doesn't charge or collect money for you and isn't part of the agreement between you and your clients.",
        "If you remove a client or delete your account, the data you entered about them goes with it.",
      ]} />

      <H2>Your content</H2>
      <P>You own what you put into Theryn. You give us permission to store, process and display it only so Theryn can work for you and the people you share it with. Don't upload anything unlawful, abusive, or that you don't have the right to share.</P>

      <H2>Acceptable use</H2>
      <P>Don't misuse Theryn: no attempts to get into other people's data, overload or break the service, copy the exercise library or app wholesale, or use it to harass anyone. We may suspend accounts that do.</P>

      <H2>Price</H2>
      <P>Theryn is currently free. If we ever charge for something, we'll say so clearly before you pay, and in the apps any purchase will go through the App Store or Google Play.</P>

      <H2>Ending your account</H2>
      <P>You can delete your account at any time from Profile → Delete account in the app, You → Delete account in the coach dashboard, or at <A href="/delete-account">/delete-account</A>. We may close accounts that break these terms, and will tell you why unless the law prevents it.</P>

      <H2>Our responsibility</H2>
      <P>We work to keep Theryn running and your data safe, but it is provided "as is" and may sometimes be unavailable or contain errors. To the extent the law allows, we aren't liable for indirect losses, or for injuries from training. Nothing in these terms limits rights you have under consumer law that can't be excluded.</P>

      <H2>App stores</H2>
      <P>If you got Theryn from the Apple App Store, Apple is not responsible for the app or its support, and Apple is a third-party beneficiary of these terms. Your use of the app also has to follow the App Store's and Google Play's own terms.</P>

      <H2>Changes and law</H2>
      <P>We may update these terms and will tell you in the app before important changes apply. These terms are governed by the laws of {fact("governingLaw")}, and disputes go to {fact("venue")}, unless the law where you live gives you the right to bring them there.</P>

      <H2>Contact</H2>
      <P>{fact("operatorName")}, {fact("operatorAddress")} · {mail ? <A href={mail}>{email}</A> : email}</P>
    </LegalPage>
  );
}
