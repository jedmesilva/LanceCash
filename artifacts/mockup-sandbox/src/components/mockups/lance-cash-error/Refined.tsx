import { AlertCircle, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import './_group.css';
import './Refined.css';

export function Refined() {
  return (
    <div className="lce-refined">
      <header className="lce-brand">
        <span className="lce-brand-mark" aria-hidden="true"><Zap size={19} fill="currentColor" /></span>
        <span>Lance Cash</span>
      </header>

      <main className="lce-main" role="alert" aria-labelledby="lce-title">
        <section className="lce-card">
          <span className="lce-symbol" aria-hidden="true"><AlertCircle size={30} strokeWidth={1.8} /></span>
          <p className="lce-eyebrow">Instabilidade temporária</p>
          <h1 id="lce-title">Não conseguimos carregar esta tela</h1>
          <p className="lce-copy">Os leilões ou a verificação da conta falharam. Tente novamente em instantes.</p>
          <button className="lce-retry" type="button">
            <RefreshCw size={19} strokeWidth={2.4} />
            Tentar novamente
          </button>
          <p className="lce-assurance">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Seu saldo e seus lances continuam protegidos.</span>
          </p>
        </section>
      </main>

      <footer className="lce-footer">Lance Cash · Leilões ao vivo</footer>
    </div>
  );
}
