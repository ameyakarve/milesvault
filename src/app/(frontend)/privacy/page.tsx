import { LegalShell } from '../_chrome/legal-shell'

export const metadata = {
  title: 'Privacy Policy — MilesVault',
  description: 'How MilesVault collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="June 21, 2026">
      <p>
        MilesVault (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a personal finance tool that turns your
        credit-card and bank statements into a private, reviewable ledger, and tracks your card
        spending and reward points and miles. It is operated by <strong>Ameya Karve</strong> as an
        individual. This policy explains what we collect, why, and what we do with it. Questions or
        requests: <a href="mailto:support@milesvault.com">support@milesvault.com</a>.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; identity.</strong> When you sign in with Google, we receive your
          name, email address, and profile picture.
        </li>
        <li>
          <strong>YouTube channel data.</strong> With your permission (the{' '}
          <code>youtube.readonly</code> scope), we read your <strong>YouTube channel ID</strong> and
          your <strong>membership status</strong> for our channel — solely to determine whether you
          are eligible to access MilesVault. We do <strong>not</strong> access your videos,
          playlists, subscriptions, watch history, or any other YouTube content.
        </li>
        <li>
          <strong>Financial information you provide.</strong> The statements and transaction emails
          you upload or forward — including merchant names, amounts, dates, account and card
          identifiers, and reward balances — which we extract into your ledger.
        </li>
        <li>
          <strong>Feedback.</strong> Messages and optional screenshots you submit through the
          in-app feedback button.
        </li>
        <li>
          <strong>Operational logs.</strong> Standard technical logs (e.g. request metadata) used to
          run and secure the service.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>Authenticate you and decide whether you may access the service.</li>
        <li>
          Read your statements and use AI to <strong>draft</strong> ledger entries for you to review
          and approve — nothing is recorded without your approval.
        </li>
        <li>Maintain your ledger and show your balances, spending, and rewards.</li>
        <li>Respond to your feedback and improve the product.</li>
      </ul>

      <h2>Where your data is processed and stored</h2>
      <p>
        Your data is processed and stored on <strong>Cloudflare</strong>&rsquo;s global network
        (Durable Objects, R2, and D1). Statement processing uses{' '}
        <strong>Cloudflare Workers AI</strong> — your statements are <strong>not</strong> sent to any
        third-party AI provider. Sign-in is handled by <strong>Google</strong>.
      </p>

      <h2>Google user data — Limited Use</h2>
      <p>
        MilesVault&rsquo;s use and transfer of information received from Google APIs adheres to the{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including its Limited Use requirements. Specifically, the YouTube data we access is used
        only to provide and improve the access-eligibility feature described above; it is not
        transferred to others except as needed to provide the service, to comply with law, or as
        part of a merger; it is not used for advertising; and no humans read it except where you
        explicitly consent, for security, or where required by law.
      </p>

      <h2>Sharing</h2>
      <p>
        We do <strong>not</strong> sell your data. We share it only with the infrastructure
        providers needed to run MilesVault — <strong>Google</strong> (authentication) and{' '}
        <strong>Cloudflare</strong> (hosting, AI processing, storage) — and where required by law.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your data until you delete it or ask us to. You can remove captured statements and
        ledger entries within the app, or request deletion of your account and all associated data
        by emailing <a href="mailto:support@milesvault.com">support@milesvault.com</a>.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable technical measures to protect your data. No system is perfectly secure,
        and MilesVault is currently in <strong>beta</strong> — please keep that in mind.
      </p>

      <h2>Your rights</h2>
      <p>
        You may access, correct, or delete your information at any time, in-app or by contacting us.
      </p>

      <h2>Children</h2>
      <p>MilesVault is not intended for anyone under 18.</p>

      <h2>Changes</h2>
      <p>
        We may update this policy; we&rsquo;ll revise the &ldquo;Last updated&rdquo; date above when
        we do.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:support@milesvault.com">support@milesvault.com</a>
      </p>
    </LegalShell>
  )
}
