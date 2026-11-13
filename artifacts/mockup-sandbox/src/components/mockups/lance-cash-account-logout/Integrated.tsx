import { ChevronRight, LogOut, Trophy, X } from 'lucide-react';
import './_group.css';

export function Integrated() {
  return (
    <main className="lc-account-preview lc-integrated-preview">
      <div className="lc-preview-context" aria-hidden="true">
        <header><b>Lance Cash</b><span>Saldo · 18 lances</span></header>
        <section>
          <small>LEILÃO AO VIVO · #12</small>
          <strong>R$ 500,00</strong>
          <p>Todos os lances</p>
        </section>
      </div>
      <div className="lc-preview-scrim" aria-hidden="true" />

      <section className="lc-preview-sheet" role="dialog" aria-modal="true" aria-labelledby="integrated-account-title">
        <header className="lc-preview-heading">
          <h1 id="integrated-account-title">Minha conta</h1>
          <button className="lc-preview-close" type="button" aria-label="Fechar">
            <X size={18} strokeWidth={2.7} />
          </button>
        </header>

        <button className="lc-account-user" type="button" aria-label="Editar dados da conta">
          <span className="lc-avatar">M</span>
          <span className="lc-user-copy">
            <b>Marina Costa</b>
            <small>marina@exemplo.com</small>
          </span>
          <span className="lc-edit">Editar</span>
        </button>

        <section className="lc-account-action-group" aria-labelledby="account-actions-title">
          <h2 id="account-actions-title">Ações da conta</h2>
          <div className="lc-preview-actions">
            <button className="lc-row-button lc-account-action-row" type="button">
              <span className="lc-icon-disc" aria-hidden="true"><Trophy size={22} /></span>
              <span className="lc-user-copy"><b>Meus prêmios</b><small>2 prêmios</small></span>
              <ChevronRight size={18} strokeWidth={3} aria-hidden="true" />
            </button>
            <button className="lc-row-button lc-account-action-row is-signout" type="button">
              <span className="lc-icon-disc" aria-hidden="true"><LogOut size={21} strokeWidth={2.5} /></span>
              <span className="lc-user-copy">
                <b>Sair da conta</b>
                <small>Encerrar sessão neste dispositivo</small>
              </span>
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
