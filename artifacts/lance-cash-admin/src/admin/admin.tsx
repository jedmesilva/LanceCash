import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, ChevronRight,
  CircleDot, Clock3, KeyRound, LogOut, ShieldCheck, Users, LoaderCircle,
  ArrowDownLeft, ArrowUpRight, Banknote, ReceiptText, Landmark,
  Search, Check, X, CheckCheck, Gift,
} from 'lucide-react';
import {
  getAdminAuctionBids,
  getGetAdminAuctionBidsQueryKey,
  getGetAdminAuctionsQueryKey,
  getGetAdminCashQueryKey,
  getGetAdminOverviewQueryKey,
  getGetAdminRedemptionsQueryKey,
  getGetAdminSessionQueryKey,
  useDeleteAdminSession,
  useGetAdminAuctions,
  useGetAdminCash,
  useGetAdminOverview,
  useGetAdminRedemptions,
  useGetAdminSession,
  usePostAdminSession,
  useUpdateAdminRedemption,
} from '@workspace/admin-api-client-react';
import type { AdminAuctionSummary, AdminCashTransaction, AdminRedemption, AdminRedemptionStatus, GetAdminAuctionsParams, GetAdminCashParams, GetAdminRedemptionsParams } from '@workspace/admin-api-client-react';
import './admin.css';

type AccessForm = { accessKey: string };
const fmt = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';
const bidDateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' });

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="adm-skeletons" aria-label="Carregando" aria-busy="true">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div>;
}

function ErrorNotice({ retry, message = 'Não foi possível carregar esta tela.' }: { retry: () => void; message?: string }) {
  return <div className="adm-notice adm-error" role="alert"><AlertTriangle size={18} /><span>{message}</span><button className="adm-button adm-button-outline adm-button-small" onClick={retry} data-testid="button-retry">Tentar novamente</button></div>;
}

function StatusPill({ status }: { status: AdminAuctionSummary['status'] }) {
  const labels: Record<AdminAuctionSummary['status'], string> = { live: 'Ao vivo', ended: 'Encerrado', upcoming: 'Agendado' };
  return <span className={`adm-status is-${status}`} data-testid={`status-auction-${status}`}><i />{labels[status]}</span>;
}

function AuctionRow({ auction }: { auction: AdminAuctionSummary }) {
  return <Link href={`/auctions/${auction.id}`} className="adm-auction-row" data-testid={`link-auction-${auction.id}`}>
    <span className="adm-row-id">#{auction.id}</span>
    <span className="adm-row-prize">{money.format(auction.prize)}</span>
    <span className="adm-row-leader">{auction.leader || 'Sem lances'}</span>
    <span className="adm-row-bids">{fmt.format(auction.bidCount)} lances</span>
    <StatusPill status={auction.status} /><ChevronRight size={16} className="adm-chevron" />
  </Link>;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState('');
  const login = usePostAdminSession();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (accessKey.trim().length < 32) {
      setError('A chave de acesso deve ter pelo menos 32 caracteres.');
      return;
    }
    login.mutate({ data: { accessKey: accessKey.trim() } }, {
      onSuccess,
      onError: () => setError('A chave de acesso não foi aceita. Confira e tente novamente.'),
    });
  };
  return <div className="adm-login-wrap">
    <section className="adm-login-card">
      <div className="adm-login-icon"><KeyRound size={21} /></div>
      <p className="adm-eyebrow">LANCE CASH / OPERAÇÕES</p>
      <h1>Acesso da equipe</h1>
      <p className="adm-login-copy">Informe a chave de acesso compartilhada para abrir o painel de controle.</p>
      <form onSubmit={submit} className="adm-login-form">
        <label htmlFor="admin-access-key">Chave de acesso</label>
        <input id="admin-access-key" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} type="password" autoComplete="current-password" placeholder="Cole a chave de acesso" data-testid="input-admin-access-key" />
        {error && <div className="adm-form-error" role="alert">{error}</div>}
        <button type="submit" className="adm-button adm-primary-button" disabled={login.isPending} data-testid="button-admin-sign-in">
          {login.isPending ? <LoaderCircle className="adm-spin" size={16} /> : <ShieldCheck size={16} />}
          {login.isPending ? 'Validando chave…' : 'Acessar painel'}
        </button>
      </form>
      <div className="adm-login-foot"><KeyRound size={13} aria-hidden="true" /> Sessão protegida por cookie seguro</div>
    </section>
  </div>;
}

function AdminShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const session = useGetAdminSession({ query: { retry: false } });
  const logout = useDeleteAdminSession();
  const authenticated = Boolean(session.data?.authenticated);
  const loginSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminAuctionsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminAuctionBidsQueryKey() });
  };
  if (session.isLoading) return <main className="adm-root"><div className="adm-frame"><Skeleton rows={5} /></div></main>;
  if (session.isError && (session.error as { status?: number }).status !== 401) {
    return <main className="adm-root"><div className="adm-frame"><ErrorNotice retry={() => void session.refetch()} message="Não foi possível verificar a sessão da equipe." /></div></main>;
  }
  if (!authenticated) return <main className="adm-root adm-auth-root"><header className="adm-auth-brand"><span className="adm-brand-mark">LC</span><b>Lance Cash</b><span>Console de operações</span></header><AdminLogin onSuccess={loginSuccess} /></main>;

  return <main className="adm-root">
    <div className="adm-frame">
      <header className="adm-topbar">
        <Link href="/" className="adm-brand" data-testid="link-admin-home"><span className="adm-brand-mark">LC</span><span>Lance Cash<small>SALA DE CONTROLE</small></span></Link>
        <nav className="adm-nav" aria-label="Navegação administrativa">
          <Link href="/" className={`adm-nav-link${location === '/' ? ' active' : ''}`} data-testid="nav-overview">Visão geral</Link>
          <Link href="/redemptions" className={`adm-nav-link${location === '/redemptions' ? ' active' : ''}`} data-testid="nav-redemptions">Resgates</Link>
          <Link href="/cash" className={`adm-nav-link${location === '/cash' ? ' active' : ''}`} data-testid="nav-cash">Caixa</Link>
          <Link href="/previous" className={`adm-nav-link${location === '/previous' ? ' active' : ''}`} data-testid="nav-previous">Anteriores</Link>
          <Link href="/upcoming" className={`adm-nav-link${location === '/upcoming' ? ' active' : ''}`} data-testid="nav-upcoming">Próximos</Link>
        </nav>
        <button className="adm-button adm-logout" onClick={() => logout.mutate(undefined, { onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
          navigate('/');
        } })} disabled={logout.isPending} data-testid="button-admin-logout">
          {logout.isPending ? <LoaderCircle className="adm-spin" size={15} /> : <LogOut size={15} />}<span>Sair</span>
        </button>
      </header>
      <div className="adm-content">{children}</div>
      <footer className="adm-footer"><span>LC / ADMIN</span><span>Operações ao vivo · sessão protegida</span></footer>
    </div>
  </main>;
}

function AuctionList({ auctions, title, detail, empty }: { auctions: AdminAuctionSummary[]; title: string; detail: string; empty: string }) {
  return <section className="adm-list-panel">
    <div className="adm-section-head"><div><p className="adm-eyebrow">{detail}</p><h2>{title}</h2></div><span className="adm-count">{auctions.length} registros</span></div>
    {auctions.length ? <div className="adm-auction-list">{auctions.map((auction) => <AuctionRow key={auction.id} auction={auction} />)}</div> : <div className="adm-empty"><CalendarClock size={20} /><p>{empty}</p></div>}
  </section>;
}

const redemptionStatusLabels: Record<AdminRedemptionStatus, string> = {
  requested: 'Solicitado',
  processing: 'Em processamento',
  fulfilled: 'Concluído',
  rejected: 'Rejeitado',
};

function RedemptionStatus({ status, id }: { status: AdminRedemptionStatus; id: string }) {
  return <span className={`adm-redemption-status is-${status}`} data-testid={`status-redemption-${id}`}>
    <i />{redemptionStatusLabels[status]}
  </span>;
}

function RedemptionRow({ redemption, compact = false, announce }: {
  redemption: AdminRedemption;
  compact?: boolean;
  announce: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateAdminRedemption();
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState('');
  const busy = update.isPending;
  const updateStatus = (status: 'processing' | 'fulfilled' | 'rejected') => {
    setError('');
    update.mutate({ redemptionId: redemption.id, data: { status } }, {
      onSuccess: () => {
        const message = status === 'processing'
          ? `Resgate de ${redemption.customerName} aprovado e enviado para processamento.`
          : status === 'fulfilled'
            ? `Resgate de ${redemption.customerName} marcado como concluído.`
            : `Resgate de ${redemption.customerName} rejeitado.`;
        announce(message);
        setConfirmReject(false);
        void queryClient.invalidateQueries({ queryKey: getGetAdminRedemptionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetAdminCashQueryKey() });
      },
      onError: () => setError('Não foi possível atualizar este resgate. Tente novamente.'),
    });
  };
  return <article className={`adm-redemption-row${compact ? ' is-compact' : ''}`} data-testid={`row-redemption-${redemption.id}`}>
    <div className="adm-redemption-main">
      <span className="adm-redemption-icon"><Gift size={16} /></span>
      <div className="adm-redemption-person">
        <strong data-testid={`text-redemption-customer-${redemption.id}`}>{redemption.customerName}</strong>
        <span>{redemption.customerEmail}</span>
        {redemption.notes && <small className="adm-redemption-notes">{redemption.notes}</small>}
      </div>
    </div>
    <div className="adm-redemption-value">
      <strong data-testid={`text-redemption-amount-${redemption.id}`}>{centsMoney(redemption.amountCents)}</strong>
      <small>Leilão #{redemption.auctionId} <i>/</i> prêmio {redemption.prizeId}</small>
    </div>
    <div className="adm-redemption-timing">
      <span>Solicitado {dateTime(redemption.requestedAt)}</span>
      {redemption.processedAt && <small>Atualizado {dateTime(redemption.processedAt)}</small>}
    </div>
    <RedemptionStatus status={redemption.status} id={redemption.id} />
    <div className="adm-redemption-actions">
      {redemption.status === 'requested' && <>
        <button className="adm-button adm-action-approve" onClick={() => updateStatus('processing')} disabled={busy} data-testid={`button-approve-redemption-${redemption.id}`}>
          {busy ? <LoaderCircle className="adm-spin" size={14} /> : <Check size={14} />} Aprovar
        </button>
        <button className="adm-button adm-action-reject" onClick={() => { setError(''); setConfirmReject(true); }} disabled={busy} data-testid={`button-reject-redemption-${redemption.id}`}>
          <X size={14} /> Rejeitar
        </button>
      </>}
      {redemption.status === 'processing' && <>
        <button className="adm-button adm-action-complete" onClick={() => updateStatus('fulfilled')} disabled={busy} data-testid={`button-complete-redemption-${redemption.id}`}>
          {busy ? <LoaderCircle className="adm-spin" size={14} /> : <CheckCheck size={14} />} Concluir
        </button>
        <button className="adm-button adm-action-reject" onClick={() => { setError(''); setConfirmReject(true); }} disabled={busy} data-testid={`button-reject-redemption-${redemption.id}`}>
          <X size={14} /> Rejeitar
        </button>
      </>}
      {(redemption.status === 'fulfilled' || redemption.status === 'rejected') && <span className="adm-terminal-note">Ação encerrada</span>}
    </div>
    {error && <div className="adm-redemption-row-error" role="alert" data-testid={`error-redemption-${redemption.id}`}>{error}</div>}
    {confirmReject && <div className="adm-reject-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`reject-title-${redemption.id}`}>
      <div><strong id={`reject-title-${redemption.id}`}>Rejeitar este resgate?</strong><p>O pedido de {redemption.customerName} será encerrado como rejeitado. Esta ação não pode ser desfeita.</p></div>
      <div className="adm-reject-confirm-actions">
        <button className="adm-button adm-button-outline adm-button-small" onClick={() => setConfirmReject(false)} disabled={busy} data-testid={`button-cancel-reject-${redemption.id}`}>Voltar</button>
        <button className="adm-button adm-action-reject" onClick={() => updateStatus('rejected')} disabled={busy} data-testid={`button-confirm-reject-${redemption.id}`}>
          {busy ? <LoaderCircle className="adm-spin" size={14} /> : <X size={14} />} Confirmar rejeição
        </button>
      </div>
    </div>}
  </article>;
}

function RedemptionQueue({ limit, compact = false }: { limit: number; compact?: boolean }) {
  const [announcement, setAnnouncement] = useState('');
  const params = useMemo<GetAdminRedemptionsParams>(() => ({ limit }), [limit]);
  const query = useGetAdminRedemptions(params, { query: { queryKey: getGetAdminRedemptionsQueryKey(params) } });
  const response = query.data;
  return <section className={`adm-redemption-panel${compact ? ' is-compact' : ''}`} aria-label="Fila de resgates">
    <header className="adm-redemption-panel-head">
      <div><p className="adm-eyebrow">PRÊMIOS / REVISÃO DA EQUIPE</p><h2>{compact ? 'Resgates para revisar' : 'Fila de resgates'}</h2></div>
      {response && <span className="adm-count" data-testid="text-redemption-total">{fmt.format(response.summary.totalCount)} no total</span>}
    </header>
    {compact && response && <div className="adm-redemption-quick-counts" aria-label="Resumo dos resgates">
      <span><b>{fmt.format(response.summary.requested)}</b> solicitados</span>
      <span><b>{fmt.format(response.summary.processing)}</b> em processamento</span>
    </div>}
    <div className="adm-redemption-announcement" role="status" aria-live="polite" data-testid="status-redemption-action">{announcement}</div>
    {query.isLoading ? <div className="adm-redemption-loading" aria-label="Carregando resgates" aria-busy="true"><Skeleton rows={compact ? 3 : 5} /></div>
      : query.isError && !response ? <ErrorNotice retry={() => void query.refetch()} message="Não foi possível carregar a fila de resgates." />
        : response?.redemptions.length ? <div className="adm-redemption-list">
          {response.redemptions.map((redemption) => <RedemptionRow key={redemption.id} redemption={redemption} compact={compact} announce={setAnnouncement} />)}
        </div>
          : <div className="adm-empty adm-redemption-empty"><Gift size={21} /><strong>Nenhum resgate aguardando</strong><p>Os novos pedidos de prêmio aparecerão nesta fila.</p></div>}
    {compact && <div className="adm-redemption-panel-foot">
      <span>Ao aprovar, o pedido apenas começa o processamento; não há transferência de dinheiro.</span>
      <Link href="/redemptions" className="adm-detail-link" data-testid="link-all-redemptions">Abrir fila completa <ArrowRight size={14} /></Link>
    </div>}
  </section>;
}

export function AdminOverviewPage() {
  const overview = useGetAdminOverview();
  return <AdminShell><>
    <div className="adm-page-heading"><div><p className="adm-eyebrow">LEILÃO AO VIVO / COMANDO</p><h1>Visão geral<span className="adm-live-pip" /></h1><p>O leilão ativo e tudo que vem a seguir.</p></div><span className="adm-updated"><CircleDot size={13} /> Monitoramento ativo</span></div>
    {overview.isLoading ? <Skeleton rows={6} /> : overview.isError ? <ErrorNotice retry={() => void overview.refetch()} /> : overview.data ? <>
      {overview.data.currentAuction ? <section className="adm-live-card" data-testid="panel-current-auction">
        <div className="adm-live-top"><div><p className="adm-eyebrow">LEILÃO ATUAL <span className="adm-divider">/</span> #{overview.data.currentAuction.id}</p><StatusPill status={overview.data.currentAuction.status} /></div><span className="adm-live-indicator"><i /> EVENTO AO VIVO</span></div>
        <div className="adm-prize">{money.format(overview.data.currentAuction.prize)}<span> prêmio</span></div>
        <div className="adm-live-grid">
          <div className="adm-live-metric"><span>Atividade de lances</span><strong data-testid="text-current-bid-count">{fmt.format(overview.data.currentAuction.bidCount)}</strong><small>lances registrados</small></div>
          <div className="adm-live-metric"><span>Pessoas assistindo</span><strong data-testid="text-watcher-count">{fmt.format(overview.data.watcherCount)}</strong><small><Users size={13} /> acompanhando agora</small></div>
          <div className="adm-live-metric"><span>Líder atual</span><strong className="adm-leader" data-testid="text-current-leader">{overview.data.currentAuction.leader || 'Sem lances'}</strong><small>na liderança</small></div>
        </div>
        <div className="adm-live-bottom"><span><Clock3 size={14} /> Início: {dateTime(overview.data.currentAuction.startedAt)}</span><Link href={`/auctions/${overview.data.currentAuction.id}`} className="adm-detail-link" data-testid="link-current-auction-bids">Abrir histórico de lances <ArrowRight size={15} /></Link></div>
      </section> : <div className="adm-empty adm-current-empty"><CircleDot size={22} /><div><strong>Nenhum leilão ao vivo</strong><p>A sala de controle está pronta para o próximo evento.</p></div></div>}
      <div className="adm-lists-grid">
        <AuctionList title="Leilões anteriores" detail="ARQUIVO" empty="Ainda não há leilões encerrados." auctions={overview.data.previousAuctions.slice(0, 5)} />
        <AuctionList title="Fila de próximos" detail="AGENDA" empty="Nenhum leilão agendado." auctions={overview.data.upcomingAuctions.slice(0, 5)} />
      </div>
      <RedemptionQueue limit={5} compact />
      <div className="adm-list-links"><Link href="/previous" data-testid="link-all-previous">Todos os anteriores <ArrowRight size={14} /></Link><Link href="/upcoming" data-testid="link-all-upcoming">Ver fila completa <ArrowRight size={14} /></Link></div>
    </> : null}
  </></AdminShell>;
}

export function AdminRedemptionsPage() {
  const limit = 20;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AdminRedemptionStatus | ''>('');
  const [offsets, setOffsets] = useState<number[]>([0]);
  const offset = offsets[offsets.length - 1] ?? 0;
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    setOffsets([0]);
  }, [search, status]);
  const params = useMemo<GetAdminRedemptionsParams>(() => ({
    limit,
    offset,
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  }), [limit, offset, search, status]);
  const query = useGetAdminRedemptions(params, { query: { queryKey: getGetAdminRedemptionsQueryKey(params) } });
  const response = query.data;
  const [announcement, setAnnouncement] = useState('');
  const goNext = () => {
    if (!response?.hasMore || response.nextOffset == null || query.isFetching) return;
    setOffsets((current) => [...current, response.nextOffset!]);
  };
  const goPrev = () => {
    if (offsets.length < 2 || query.isFetching) return;
    setOffsets((current) => current.slice(0, -1));
  };
  const pageNumber = offsets.length;
  return <AdminShell><>
    <div className="adm-page-heading adm-redemptions-heading">
      <div><p className="adm-eyebrow">PRÊMIOS / CONTROLE DE OPERAÇÕES</p><h1>Resgates</h1><p>Revise pedidos e registre o próximo passo — aprovação inicia o processamento, não o pagamento.</p></div>
      <span className="adm-redemption-ledger-tag"><Gift size={15} /> FILA / REVISÃO</span>
    </div>
    {response && <section className="adm-redemption-summary" aria-label="Resumo dos resgates">
      {([
        ['requested', 'Solicitados'],
        ['processing', 'Em processamento'],
        ['fulfilled', 'Concluídos'],
        ['rejected', 'Rejeitados'],
      ] as const).map(([key, label]) => <div className={`adm-redemption-metric is-${key}`} key={key}>
        <span>{label}</span><strong data-testid={`text-redemptions-${key}`}>{fmt.format(response.summary[key])}</strong>
      </div>)}
    </section>}
    <section className="adm-redemption-panel adm-redemption-directory" aria-label="Lista completa de resgates">
      <header className="adm-redemption-panel-head">
        <div><p className="adm-eyebrow">REGISTROS / BUSCA NO SERVIDOR</p><h2>Todos os pedidos</h2></div>
        {response && <span className="adm-count" data-testid="text-redemptions-count">{fmt.format(response.totalCount)} registros</span>}
      </header>
      <div className="adm-redemption-filters">
        <label className="adm-redemption-search"><Search size={16} /><span className="adm-sr-only">Buscar resgates</span>
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Nome, e-mail ou identificador" data-testid="input-redemption-search" />
        </label>
        <label className="adm-redemption-status-filter"><span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as AdminRedemptionStatus | '')} data-testid="select-redemption-status">
            <option value="">Todos os status</option>
            <option value="requested">Solicitado</option>
            <option value="processing">Em processamento</option>
            <option value="fulfilled">Concluído</option>
            <option value="rejected">Rejeitado</option>
          </select>
        </label>
        {(searchInput || status) && <button className="adm-button adm-button-outline adm-button-small" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); }} data-testid="button-clear-redemption-filters">Limpar filtros</button>}
      </div>
      <div className="adm-redemption-announcement" role="status" aria-live="polite" data-testid="status-redemption-action">{announcement}</div>
      {query.isLoading ? <div className="adm-redemption-loading" aria-label="Carregando resgates" aria-busy="true"><Skeleton rows={6} /></div>
        : query.isError && !response ? <ErrorNotice retry={() => void query.refetch()} message="Não foi possível carregar os resgates." />
          : <>
            {query.isError && <ErrorNotice retry={() => void query.refetch()} message="Não foi possível atualizar esta página de resgates." />}
            {response?.redemptions.length ? <div className="adm-redemption-list">
              {response.redemptions.map((redemption) => <RedemptionRow key={redemption.id} redemption={redemption} announce={setAnnouncement} />)}
            </div> : <div className="adm-empty adm-redemption-empty"><Gift size={21} /><strong>Nenhum pedido encontrado</strong><p>{search || status ? 'Ajuste a busca ou o status para encontrar resgates.' : 'Os pedidos de prêmio aparecerão aqui.'}</p></div>}
            <footer className="adm-redemption-pagination">
              <span>Página {pageNumber} <i>/</i> {fmt.format(response?.totalCount ?? 0)} registros</span>
              <div><button className="adm-button adm-button-outline adm-button-small" onClick={goPrev} disabled={offsets.length < 2 || query.isFetching} data-testid="button-redemptions-previous"><ArrowLeft size={14} /> Anterior</button>
                <button className="adm-button adm-button-outline adm-button-small" onClick={goNext} disabled={!response?.hasMore || query.isFetching || response.nextOffset == null} data-testid="button-redemptions-next">Próxima <ArrowRight size={14} /></button></div>
            </footer>
          </>}
    </section>
  </></AdminShell>;
}

const cashMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const cashStatusLabels: Record<AdminCashTransaction['status'], string> = {
  pending: 'Pendente',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
  requested: 'Solicitado',
  processing: 'Em processamento',
  fulfilled: 'Concluído',
  rejected: 'Rejeitado',
};
const cashKindLabels: Record<AdminCashTransaction['kind'], string> = {
  package_purchase: 'Compra de pacote',
  prize_redemption: 'Resgate de prêmio',
};
const cashSourceLabels: Record<Exclude<AdminCashTransaction['source'], null>, string> = {
  efi_bank_pix: 'Pix Efí Bank',
  simulated_pix: 'Pix Simulado',
};
const cashDirectionLabels: Record<AdminCashTransaction['direction'], string> = {
  inflow: 'Entrada confirmada',
  outflow: 'Saída confirmada',
  pending: 'Pendente',
  excluded: 'Fora dos totais',
};
const centsMoney = (value: number) => cashMoney.format(value / 100);

function CashMetric({ label, amount, detail, tone, testId }: {
  label: string;
  amount: number;
  detail: string;
  tone: 'inflow' | 'outflow' | 'net';
  testId: string;
}) {
  return <div className={`adm-cash-metric is-${tone}`}>
    <span>{label}</span>
    <strong data-testid={testId}>{centsMoney(amount)}</strong>
    <small>{detail}</small>
  </div>;
}

function CashTransactionRow({ transaction }: { transaction: AdminCashTransaction }) {
  const sign = transaction.direction === 'inflow' ? '+' : transaction.direction === 'outflow' ? '−' : '';
  return <article className="adm-cash-row" data-testid={`row-cash-transaction-${transaction.id}`}>
    <div className="adm-cash-transaction-main">
      <span className={`adm-cash-kind-icon is-${transaction.kind}`}>
        {transaction.kind === 'package_purchase' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
      </span>
      <div className="adm-cash-description">
        <strong data-testid={`text-cash-description-${transaction.id}`}>{transaction.description || cashKindLabels[transaction.kind]}</strong>
        <span>{transaction.customerName || 'Cliente não identificado'} <i>/</i> {cashKindLabels[transaction.kind]}</span>
        {transaction.packageBids != null && <small>{fmt.format(transaction.packageBids)} lances no pacote</small>}
      </div>
    </div>
    <div className="adm-cash-channel">
      <span data-testid={`text-cash-source-${transaction.id}`}>
        {transaction.source ? cashSourceLabels[transaction.source] : 'Resgate de prêmio'}
      </span>
      <small>{transaction.auctionId != null ? `Leilão #${transaction.auctionId}` : transaction.packageId ? `Pacote ${transaction.packageId}` : '—'}</small>
    </div>
    <div className="adm-cash-timing">
      <span>{dateTime(transaction.createdAt)}</span>
      <small>{transaction.settledAt ? `Liquidado ${dateTime(transaction.settledAt)}` : 'Sem liquidação registrada'}</small>
    </div>
    <div className="adm-cash-amount">
      <strong className={`is-${transaction.direction}`} data-testid={`text-cash-amount-${transaction.id}`}>
        {sign}{centsMoney(transaction.amountCents)}
      </strong>
      <small>{cashDirectionLabels[transaction.direction]}</small>
    </div>
    <span className={`adm-cash-status is-${transaction.status}`} data-testid={`status-cash-${transaction.id}`}>{cashStatusLabels[transaction.status]}</span>
  </article>;
}

export function AdminCashPage() {
  const limit = 25;
  const [offsets, setOffsets] = useState<number[]>([0]);
  const offset = offsets[offsets.length - 1] ?? 0;
  const params = useMemo<GetAdminCashParams>(() => ({ offset, limit }), [offset]);
  const cash = useGetAdminCash(params, { query: { queryKey: getGetAdminCashQueryKey(params) } });
  const response = cash.data;
  const pageNumber = offsets.length;
  const goNext = () => {
    if (!response?.hasMore || response.nextOffset == null || cash.isFetching) return;
    setOffsets((current) => [...current, response.nextOffset!]);
  };
  const goPrev = () => {
    if (offsets.length < 2 || cash.isFetching) return;
    setOffsets((current) => current.slice(0, -1));
  };

  return <AdminShell><>
    <div className="adm-page-heading adm-cash-heading">
      <div>
        <p className="adm-eyebrow">FINANÇAS / REGISTRO OPERACIONAL</p>
        <h1>Caixa</h1>
        <p>Entradas de pacotes, resgates e origem do Pix em um só registro.</p>
      </div>
      <span className="adm-cash-ledger-tag"><ReceiptText size={15} /> LEDGER / BRL</span>
    </div>

    <aside className="adm-cash-simulation" role="note" data-testid="notice-cash-simulated">
      <span className="adm-cash-simulation-icon"><Landmark size={17} /></span>
      <div><strong>O caixa do app não substitui o extrato bancário.</strong><p>Pix Simulado é apenas demonstração. Pix Efí Bank deve aparecer somente após confirmação do provedor; os valores deste painel seguem os registros do app.</p></div>
    </aside>

    {cash.isLoading ? <section className="adm-cash-loading" aria-label="Carregando resumo e transações" aria-busy="true">
      <div className="adm-cash-metrics-skeleton">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
      <Skeleton rows={6} />
    </section> : cash.isError && !response ? <ErrorNotice retry={() => void cash.refetch()} message="Não foi possível carregar o ledger de caixa." /> : response ? <>
      <section className="adm-cash-summary" aria-label="Resumo do caixa">
        <CashMetric label="Entradas confirmadas" amount={response.summary.inflowCents} detail="Pacotes pagos" tone="inflow" testId="text-cash-inflow" />
        <CashMetric label="Reembolsos" amount={response.summary.refundCents} detail="Compras reembolsadas" tone="outflow" testId="text-cash-refunds" />
        <CashMetric label="Prêmios resgatados" amount={response.summary.prizeOutflowCents} detail="Resgates concluídos" tone="outflow" testId="text-cash-prize-outflow" />
        <CashMetric label="Saldo líquido modelado" amount={response.summary.netCents} detail="Entradas menos saídas confirmadas" tone="net" testId="text-cash-net" />
      </section>
      <section className="adm-cash-pending" data-testid="panel-cash-pending">
        <div><span className="adm-cash-pending-dot" /><span><b>Em aberto</b><small>Não incluído nos totais confirmados</small></span></div>
        <span><small>Entradas</small><strong data-testid="text-cash-pending-inflow">{centsMoney(response.summary.pendingInflowCents)}</strong></span>
        <span><small>Saídas</small><strong data-testid="text-cash-pending-outflow">{centsMoney(response.summary.pendingOutflowCents)}</strong></span>
        <span className="adm-cash-count"><small>Registros no total</small><strong data-testid="text-cash-transaction-count">{fmt.format(response.summary.transactionCount)}</strong></span>
      </section>

      {cash.isError && <ErrorNotice retry={() => void cash.refetch()} message="Não foi possível atualizar a página atual do ledger." />}
      <section className="adm-cash-ledger" aria-label="Transações de caixa">
        <header className="adm-cash-ledger-head">
          <div><p className="adm-eyebrow">MOVIMENTAÇÕES</p><h2>Transações registradas</h2></div>
          <span data-testid="text-cash-page-total">{fmt.format(response.totalCount)} registros</span>
        </header>
        {response.transactions.length ? <>
          <div className="adm-cash-columns" aria-hidden="true"><span>Descrição</span><span>Origem</span><span>Registrado</span><span>Valor modelado</span><span>Status</span></div>
          <div className="adm-cash-list">{response.transactions.map((transaction) => <CashTransactionRow key={transaction.id} transaction={transaction} />)}</div>
        </> : <div className="adm-empty adm-cash-empty"><Banknote size={22} /><strong>Nenhuma transação registrada</strong><p>Quando houver compras ou resgates, eles aparecerão aqui.</p></div>}
        <footer className="adm-cash-pagination">
          <span>Página {pageNumber} <i>/</i> {fmt.format(response.totalCount)} registros</span>
          <div>
            <button className="adm-button adm-button-outline adm-button-small" onClick={goPrev} disabled={offsets.length < 2 || cash.isFetching} data-testid="button-cash-previous"><ArrowLeft size={14} /> Anterior</button>
            <button className="adm-button adm-button-outline adm-button-small" onClick={goNext} disabled={!response.hasMore || cash.isFetching || response.nextOffset == null} data-testid="button-cash-next">Próxima <ArrowRight size={14} /></button>
          </div>
        </footer>
      </section>
    </> : null}
  </></AdminShell>;
}

function AuctionCollection({ status }: { status: 'ended' | 'upcoming' }) {
  const [cursor, setCursor] = useState<number | undefined>();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const params = useMemo<GetAdminAuctionsParams>(() => ({ status, ...(cursor != null ? { cursor } : {}), limit: 20 }), [status, cursor]);
  const query = useGetAdminAuctions(params, { query: { queryKey: getGetAdminAuctionsQueryKey(params) } });
  const pageIndex = Math.max(0, cursors.length - 1);
  const goNext = () => {
    if (!query.data?.hasMore || query.data.nextCursor == null) return;
    const next = query.data.nextCursor;
    setCursors((old) => [...old, next]);
    setCursor(next);
  };
  const goPrev = () => {
    if (pageIndex <= 0) return;
    setCursors((old) => old.slice(0, -1));
    setCursor(cursors[pageIndex - 1]);
  };
  const [, navigate] = useLocation();
  return <AdminShell><>
    <button className="adm-back" onClick={() => navigate('/')} data-testid="button-back-overview"><ArrowLeft size={15} /> Visão geral</button>
    <div className="adm-page-heading"><div><p className="adm-eyebrow">DIRETÓRIO DE LEILÕES / {status === 'ended' ? 'ARQUIVO' : 'AGENDA'}</p><h1>{status === 'ended' ? 'Leilões anteriores' : 'Próximos leilões'}</h1><p>{status === 'ended' ? 'Eventos encerrados e seus históricos completos.' : 'Eventos programados para entrar na fila.'}</p></div></div>
    <section className="adm-list-panel adm-directory">
      <div className="adm-directory-head"><span>Leilão</span><span>Prêmio</span><span>Líder</span><span>Atividade</span><span>Status</span></div>
      {query.isLoading ? <Skeleton rows={7} /> : query.isError ? <ErrorNotice retry={() => void query.refetch()} /> : (query.data?.auctions.length ?? 0) === 0 ? <div className="adm-empty"><CalendarClock size={20} /><p>Nenhum leilão {status === 'ended' ? 'anterior' : 'próximo'} encontrado.</p></div> : query.data!.auctions.map((auction) => <AuctionRow key={auction.id} auction={auction} />)}
      <div className="adm-pagination"><button className="adm-button adm-button-outline adm-button-small" onClick={goPrev} disabled={pageIndex === 0 || query.isFetching} data-testid="button-auctions-previous"><ArrowLeft size={14} /> Anterior</button><span>Página {pageIndex + 1}</span><button className="adm-button adm-button-outline adm-button-small" onClick={goNext} disabled={!query.data?.hasMore || query.isFetching} data-testid="button-auctions-next">Próxima <ArrowRight size={14} /></button></div>
    </section>
  </></AdminShell>;
}

export function AdminPreviousPage() { return <AuctionCollection status="ended" />; }
export function AdminUpcomingPage() { return <AuctionCollection status="upcoming" />; }

export function AdminAuctionDetailPage() {
  const params = useParams<{ auctionId: string }>();
  const auctionId = Number(params.auctionId);
  const queryParams = useMemo(() => ({ auctionId, limit: 100 }), [auctionId]);
  const history = useInfiniteQuery({
    queryKey: getGetAdminAuctionBidsQueryKey(queryParams),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => getAdminAuctionBids(
      {
        ...queryParams,
        ...(pageParam != null ? { before: pageParam } : {}),
      },
      { signal },
    ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextBefore ?? undefined : undefined,
    enabled: Number.isInteger(auctionId) && auctionId > 0,
  });
  const [, navigate] = useLocation();
  useEffect(() => {
    if (
      history.hasNextPage &&
      !history.isFetchingNextPage &&
      !history.isFetchNextPageError
    ) {
      void history.fetchNextPage();
    }
  }, [
    history.fetchNextPage,
    history.hasNextPage,
    history.isFetchingNextPage,
    history.isFetchNextPageError,
  ]);
  const auction = history.data?.pages[0]?.auction;
  const bids = history.data?.pages.flatMap((page) => page.bids) ?? [];
  return <AdminShell><>
    <button className="adm-back" onClick={() => navigate('/')} data-testid="button-back-overview"><ArrowLeft size={15} /> Visão geral</button>
    <div className="adm-page-heading adm-detail-heading"><div><p className="adm-eyebrow">LEILÃO / HISTÓRICO COMPLETO</p><h1>{auction ? money.format(auction.prize) : `Leilão #${auctionId}`} <span className="adm-heading-id">#{auctionId}</span></h1><p>Todos os lances, do mais recente ao mais antigo.</p></div>{auction && <StatusPill status={auction.status} />}</div>
    {!Number.isInteger(auctionId) || auctionId < 1 ? <ErrorNotice retry={() => navigate('/')} message="Este identificador de leilão é inválido." /> : <section className="adm-history-panel">
      {auction && <div className="adm-history-summary"><span><b>{fmt.format(auction.bidCount)}</b> lances no total</span><span>Líder <b>{auction.leader || '—'}</b></span><span>Início {dateTime(auction.startedAt)}</span></div>}
      {history.isLoading ? <Skeleton rows={7} /> : history.isError && !history.data ? <ErrorNotice retry={() => void history.refetch()} /> : bids.length === 0 ? <div className="adm-empty"><CalendarClock size={20} /><p>Nenhum lance registrado neste leilão.</p></div> : <>
        <div className="adm-bid-table-wrap"><table className="adm-bid-table"><thead><tr><th>Número</th><th>Licitante</th><th>Origem (source)</th><th>Registrado</th></tr></thead><tbody>{bids.map((bid) => <tr key={bid.id} data-testid={`row-bid-${bid.id}`}><td><span className="adm-bid-number">#{fmt.format(bid.number)}</span></td><td className="adm-bidder">{bid.leader}</td><td><code className="adm-bid-source">{bid.source}</code></td><td className="adm-bid-date">{bidDateTime.format(new Date(bid.createdAt))}</td></tr>)}</tbody></table></div>
        {history.hasNextPage && !history.isFetchNextPageError && <div className="adm-load-older" role="status"><LoaderCircle className="adm-spin" size={15} /> Carregando todos os lances: {fmt.format(bids.length)} de {fmt.format(auction?.bidCount ?? bids.length)}</div>}
        {history.isFetchNextPageError && <ErrorNotice retry={() => void history.fetchNextPage()} message="Não foi possível carregar todos os lances." />}
      </>}
    </section>}
  </></AdminShell>;
}
