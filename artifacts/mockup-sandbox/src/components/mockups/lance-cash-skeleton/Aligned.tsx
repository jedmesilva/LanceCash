import './_group.css';

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="var(--lc-logo-fill)" stroke="var(--lc-logo-stroke)" strokeWidth="1.6" />
      <path d="M15.5 9a4.2 4.2 0 1 0 0 6M12 6.5v11" fill="none" stroke="var(--lc-logo-stroke)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={`lc-skel ${className}`} aria-hidden="true" />;
}

export function Aligned() {
  return (
    <main className="lc-app" aria-label="Carregando leilões" aria-busy="true">
      <header className="lc-header">
        <div className="lc-brand"><LogoMark /> Lance Cash</div>
        <div className="lc-actions">
          <SkeletonBlock className="lc-skel-header-login" />
        </div>
      </header>

      <nav className="lc-pager" aria-hidden="true">
        <span className="lc-pager-button"><SkeletonBlock className="lc-skel-pager-control" /></span>
        <div className="lc-pager-caption">
          <SkeletonBlock className="lc-skel-pager-line" />
          <div className="lc-dots">
            <SkeletonBlock className="lc-skel-dot" />
            <SkeletonBlock className="lc-skel-dot" />
            <SkeletonBlock className="lc-skel-dot-selected" />
            <SkeletonBlock className="lc-skel-dot" />
            <SkeletonBlock className="lc-skel-dot" />
          </div>
        </div>
        <span className="lc-pager-button"><SkeletonBlock className="lc-skel-pager-control" /></span>
      </nav>

      <div className="lc-slides" aria-hidden="true">
        <section className="lc-slide">
          <div className="lc-slide-inner">
            <h1 className="lc-prize lc-loading-prize">
              <SkeletonBlock className="lc-skel-currency" />
              <SkeletonBlock className="lc-skel-prize-value" />
            </h1>

            <section className="lc-skeleton-current">
              <SkeletonBlock className="lc-skel-current-ring" />
              <div className="lc-skeleton-current-copy">
                <SkeletonBlock className="lc-skel-kicker" />
                <SkeletonBlock className="lc-skel-leader" />
                <SkeletonBlock className="lc-skel-subline" />
              </div>
            </section>

            <h2 className="lc-section-title">
              <SkeletonBlock className="lc-skel-bid-title" />
              <SkeletonBlock className="lc-skel-bid-count" />
            </h2>

            <ol className="lc-bid-list">
              {Array.from({ length: 8 }, (_, index) => (
                <li className="lc-bid-row" key={index}>
                  <SkeletonBlock className="lc-skel-avatar" />
                  <div className="lc-bid-meta">
                    <SkeletonBlock className="lc-skel-bid-name" />
                    <SkeletonBlock className="lc-skel-bid-number" />
                  </div>
                  <SkeletonBlock className="lc-skel-bid-time" />
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      <footer className="lc-footer" aria-hidden="true">
        <p><SkeletonBlock className="lc-skel-footer-copy" /></p>
        <div className="lc-cta lc-skel lc-skel-footer-button" />
      </footer>
    </main>
  );
}
