import { LegalShell } from '../_chrome/legal-shell'

export const metadata = {
  title: 'Privacy Policy — MilesVault',
  description: 'How MilesVault collects, uses, and protects your data.',
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="June 21, 2026">
      <p>
        MilesVault (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a rewards-tracking app that turns your
        credit-card statements into a ledger of the points and miles you earn, helping you track and
        optimise your card rewards and airline miles across your loyalty programmes. It is operated
        by <strong>Ameya Karve</strong> as an individual. This policy explains what we collect, why,
        and what we do with it. Questions or requests:{' '}
        <a href="mailto:support@milesvault.com">support@milesvault.com</a>.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; identity.</strong> When you sign in with Discord, we receive your
          Discord username, email address, avatar, and user ID.
        </li>
        <li>
          <strong>Discord membership.</strong> With your permission, we read whether your Discord
          account is a member of our server and holds our member role — solely to verify your
          eligibility to access MilesVault. We do <strong>not</strong> read your messages, your other
          servers, or any other Discord content.
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
        third-party AI provider. Sign-in and membership verification are handled by{' '}
        <strong>Discord</strong>.
      </p>

      <h2>Sharing</h2>
      <p>
        We do <strong>not</strong> sell your data. We share it only with the infrastructure
        providers needed to run MilesVault — <strong>Discord</strong> (sign-in &amp; membership) and{' '}
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
