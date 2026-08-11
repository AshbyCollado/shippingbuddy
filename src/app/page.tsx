import Link from "next/link";

export default function HomePage() {
  return (
    <main className="start-page" data-app-id="shipping-buddy">
      <div className="start-shell">
        <header className="start-brand"><span aria-hidden="true">SB</span><strong>Shipping Buddy</strong></header>
        <section className="start-card">
          <p className="start-eyebrow">BOX PLANNING, MADE SIMPLE</p>
          <h1>Pack it right.<br />One clear step at a time.</h1>
          <p>Tell us what you are shipping and what box or cardboard you have. We will guide you from measurements to an easy visual plan.</p>
          <Link className="start-cta" href="/plan/item">Plan my box <span aria-hidden="true">→</span></Link>
          <small>No account needed · Drafts save on this device</small>
        </section>
      </div>
    </main>
  );
}
