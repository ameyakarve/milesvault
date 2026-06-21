import { LegalShell } from '../_chrome/legal-shell'

export const metadata = {
  title: 'Terms of Service — MilesVault',
  description: 'The terms under which you may use MilesVault.',
}

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="June 21, 2026">
      <p>
        These terms govern your use of MilesVault (&ldquo;the Service&rdquo;), operated by{' '}
        <strong>Ameya Karve</strong>. By signing in or using the Service, you agree to them. If you
        don&rsquo;t agree, please don&rsquo;t use it.
      </p>

      <h2>1. The service</h2>
      <p>
        MilesVault turns your card statements into a rewards ledger that tracks the points and miles
        you earn across your cards and loyalty programmes. It is currently in <strong>beta</strong>:
        features may change, break, or be removed, and it is provided on an &ldquo;as is&rdquo; and
        &ldquo;as available&rdquo; basis.
      </p>

      <h2>2. Eligibility &amp; your account</h2>
      <p>
        You must be at least 18. You sign in with Google and are responsible for keeping access to
        your account secure and for the information you provide.
      </p>

      <h2>3. Your data</h2>
      <p>
        The financial data you add is <strong>yours</strong>. You grant us a limited licence to
        store and process it solely to provide the Service (including AI-assisted drafting), as
        described in our{' '}
        <a href="/privacy">Privacy Policy</a>. You can export or delete your data at any time.
      </p>

      <h2>4. Not financial advice</h2>
      <p>
        MilesVault is a record-keeping and organisation tool — <strong>not</strong> financial,
        accounting, tax, or investment advice. Entries are <strong>drafted by AI and may be
        wrong</strong>; you are responsible for reviewing them before relying on them, and for the
        accuracy of your own records and any financial decisions you make.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Don&rsquo;t misuse the Service: no attempting to break, overload, or reverse-engineer it, no
        unauthorised access, and no uploading content you don&rsquo;t have the right to.
      </p>

      <h2>6. Disclaimers &amp; liability</h2>
      <p>
        To the fullest extent permitted by law, the Service is provided without warranties of any
        kind, and we are not liable for any indirect, incidental, or consequential damages, or for
        any loss of data, arising from your use of a beta product. Nothing here limits liability
        that cannot be limited by law.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or end
        access if these terms are breached or to protect the Service.
      </p>

      <h2>8. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts at Bengaluru, Karnataka shall
        have jurisdiction.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms; continued use after a change means you accept it. We&rsquo;ll
        revise the &ldquo;Last updated&rdquo; date above.
      </p>

      <h2>10. Contact</h2>
      <p>
        <a href="mailto:support@milesvault.com">support@milesvault.com</a>
      </p>
    </LegalShell>
  )
}
