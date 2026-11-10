type ModalShowcaseProps = { desktop: boolean };

const bundles = [
  { total: '15 lances', detail: 'R$ 1,00 por lance', price: 'R$ 15', label: 'Para começar' },
  { total: '55 lances', detail: '50 + 5 de bônus. R$ 0,82 por lance', price: 'R$ 45', discount: '−18%' },
  { total: '140 lances', detail: '120 + 20 de bônus. R$ 0,71 por lance', price: 'R$ 99', discount: '−29%', label: 'Mais popular' },
  { total: '375 lances', detail: '300 + 75 de bônus. R$ 0,56 por lance', price: 'R$ 210', discount: '−44%', label: 'Melhor valor' },
];

function AppBackdrop() {
  return (
    <>
      <div className="lc-mockup-app" aria-hidden="true">
        <div className="lc-mockup-app-header">
          <span>LANCE CASH</span>
          <span>Saldo · 0 lances</span>
        </div>
        <div className="lc-mockup-auction">
          <small>Leilão ao vivo · #248</small>
          <h2>Prêmio acumulado</h2>
          <strong>R$ 5.000</strong>
          <div className="lc-mockup-progress" />
          <div className="lc-mockup-bids"><i /><i /><i /></div>
        </div>
      </div>
      <div className="lc-mockup-dim" aria-hidden="true" />
    </>
  );
}

function PurchaseDialog() {
  return (
    <div className="lc-mockup-dialog lc-dialog" role="dialog" aria-modal="true" aria-labelledby="purchase-preview-title">
      <div className="lc-dialog-content">
        <div className="lc-dialog-heading">
          <div>
            <h2 id="purchase-preview-title">Comprar lances</h2>
            <p>Seu saldo acabou. Escolha um pacote para continuar.</p>
          </div>
          <button className="lc-close" type="button" aria-label="Fechar">×</button>
        </div>
        <div className="lc-package-list">
          {bundles.map((bundle, index) => (
            <div className={`lc-package ${index === 2 ? 'is-selected' : ''}`} key={bundle.total}>
              {bundle.label && <em className="lc-package-label">{bundle.label}</em>}
              <div className="lc-package-card">
                <i className="lc-radio" />
                <span className="lc-package-info">
                  <b>{bundle.total}</b>
                  <small>{bundle.detail}</small>
                </span>
                <span className="lc-package-price">
                  <span>{bundle.price}</span>
                  {bundle.discount && <em>{bundle.discount}</em>}
                </span>
              </div>
            </div>
          ))}
        </div>
        <button className="lc-cta" type="button">Pagar R$ 99 com Pix</button>
        <p className="lc-note">Pix simulado neste protótipo. Lances usados não são reembolsados.</p>
      </div>
    </div>
  );
}

function AccountDialog({ desktop }: { desktop: boolean }) {
  return (
    <div className={`lc-mockup-dialog lc-mockup-dialog--account lc-dialog ${desktop ? 'lc-account-desktop' : ''}`} role="dialog" aria-modal="true" aria-labelledby="account-preview-title">
      <div className="lc-dialog-content">
        <div className="lc-dialog-header-actions">
          <h2 id="account-preview-title">Minha conta</h2>
          <button className="lc-close" type="button" aria-label="Fechar">×</button>
        </div>
        <button className="lc-account-user" type="button">
          <span className="lc-avatar">V</span>
          <span className="lc-user-copy">
            <b>Vitor Almeida</b>
            <small>vitor@exemplo.com</small>
          </span>
          <span className="lc-edit">Editar</span>
        </button>
        <div className="lc-account-actions">
          <button className="lc-row-button" type="button">
            <span className="lc-icon-disc" aria-hidden="true">♜</span>
            <span className="lc-user-copy">
              <b>Meus prêmios</b>
              <small>2 prêmios</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          <button className="lc-cta secondary" type="button">Sair da conta</button>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ desktop, title, children }: { desktop: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className="lc-mockup-panel-wrap">
      <h2 className="lc-mockup-panel-label">{title}</h2>
      <div className="lc-mockup-screen">
        <AppBackdrop />
        {children}
      </div>
    </section>
  );
}

export function ModalShowcase({ desktop }: ModalShowcaseProps) {
  return (
    <main className={`lc-mockup ${desktop ? 'lc-mockup--desktop' : 'lc-mockup--current'}`}>
      <header className="lc-mockup-header">
        <div>
          <p>Lance Cash · modal responsivo</p>
          <h1>{desktop ? 'Experiência de desktop' : 'Comportamento atual'}</h1>
        </div>
        <span>{desktop ? 'Modais centralizados e conteúdo reorganizado' : 'Padrão de gaveta mobile em viewport desktop'}</span>
      </header>
      <div className="lc-mockup-panels">
        <PreviewPanel desktop={desktop} title="Compra de lances">
          <PurchaseDialog />
        </PreviewPanel>
        <PreviewPanel desktop={desktop} title="Conta e prêmios">
          <AccountDialog desktop={desktop} />
        </PreviewPanel>
      </div>
    </main>
  );
}
