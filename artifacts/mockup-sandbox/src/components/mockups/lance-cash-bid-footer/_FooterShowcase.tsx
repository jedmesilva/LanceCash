type FooterShowcaseProps = { floating: boolean };

export function FooterShowcase({ floating }: FooterShowcaseProps) {
  return (
    <main className="lc-bid-review">
      <header className="lc-bid-review-header">
        <div>
          <p>Lance Cash · ação principal</p>
          <h1>{floating ? 'Cartão flutuante no desktop' : 'Barra atual no desktop'}</h1>
        </div>
        <span>{floating ? 'Afastada do fundo, sem mexer no snap' : 'Continua encostada na borda inferior'}</span>
      </header>
      <section className={`lc-bid-screen ${floating ? 'lc-bid-screen--floating' : ''}`}>
        <div className="lc-bid-screen-header">
          <span>LANCE CASH</span>
          <span>⚡ 5 lances</span>
        </div>
        <div className="lc-bid-auction">
          <small>Leilão #148 · Ao vivo</small>
          <h2>R$ 1.000,00</h2>
          <div className="lc-bid-state">
            <span className="lc-bid-timer">15</span>
            <span className="lc-bid-state-copy">
              <small>Lance atual #1.276</small>
              <b>Marina S.</b>
              <small>Ao zerar, quem deu o último lance leva o prêmio</small>
            </span>
          </div>
          <div className="lc-bid-rows" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <footer className="lc-footer">
          <p>Cada lance reinicia o tempo em 15 s</p>
          <button className="lc-cta" type="button">Dar lance</button>
        </footer>
      </section>
    </main>
  );
}
