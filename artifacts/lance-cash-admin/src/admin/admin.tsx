import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, ChevronRight,
  CircleDot, Clock3, KeyRound, LogOut, ShieldCheck, Users, LoaderCircle,
} from 'lucide-react';
import {
  getAdminAuctionBids,
  getGetAdminAuctionBidsQueryKey,
  getGetAdminAuctionsQueryKey,
  getGetAdminOverviewQueryKey,
  getGetAdminSessionQueryKey,
  useDeleteAdminSession,
  useGetAdminAuctions,
  useGetAdminOverview,
  useGetAdminSession,
  usePostAdminSession,
} from '@workspace/admin-api-client-react';
import type { AdminAuctionSummary, GetAdminAuctionsParams } from '@workspace/admin-api-client-react';
import './admin.css';

type AccessForm = { accessKey: string };
const fmt = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

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
      <div className="adm-list-links"><Link href="/previous" data-testid="link-all-previous">Todos os anteriores <ArrowRight size={14} /></Link><Link href="/upcoming" data-testid="link-all-upcoming">Ver fila completa <ArrowRight size={14} /></Link></div>
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
        <div className="adm-bid-table-wrap"><table className="adm-bid-table"><thead><tr><th>Número</th><th>Licitante</th><th>Origem (source)</th><th>Registrado</th></tr></thead><tbody>{bids.map((bid) => <tr key={bid.id} data-testid={`row-bid-${bid.id}`}><td><span className="adm-bid-number">#{fmt.format(bid.number)}</span></td><td className="adm-bidder">{bid.leader}</td><td><code className="adm-bid-source">{bid.source}</code></td><td className="adm-bid-date">{dateTime(bid.createdAt)}</td></tr>)}</tbody></table></div>
        {history.hasNextPage && !history.isFetchNextPageError && <div className="adm-load-older" role="status"><LoaderCircle className="adm-spin" size={15} /> Carregando todos os lances: {fmt.format(bids.length)} de {fmt.format(auction?.bidCount ?? bids.length)}</div>}
        {history.isFetchNextPageError && <ErrorNotice retry={() => void history.fetchNextPage()} message="Não foi possível carregar todos os lances." />}
      </>}
    </section>}
  </></AdminShell>;
}
