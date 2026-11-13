import './_group.css';
import './Current.css';

export function Current() {
  return (
    <div className="lce-current">
      <main className="lc-error">
        <h1>Não foi possível carregar</h1>
        <p>Não conseguimos carregar os leilões ou verificar sua conta agora.</p>
        <button className="lc-cta" type="button">Tentar novamente</button>
      </main>
    </div>
  );
}
