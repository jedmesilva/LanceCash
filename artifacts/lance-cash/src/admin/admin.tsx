import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, Bot, CalendarClock, ChevronRight,
  CircleDot, Clock3, KeyRound, LoaderCircle, LogOut, Search, Settings2, ShieldCheck, Users,
} from 'lucide-react';
import {
  getGetAdminAuctionBidsQueryKey, getGetAdminAuctionsQueryKey, getGetAdminOverviewQueryKey,
  getGetAdminSessionQueryKey, useDeleteAdminSession, useGetAdminAuctionBids,
  useGetAdminAuctions, useGetAdminOverview, useGetAdminSession, usePostAdminSession,
  useUpdateAdminSystemBidsSettings,
} from '@workspace/api-client-react';
import type { AdminAuctionBid, AdminAuctionSummary, GetAdminAuctionsParams } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import './admin.css';

type AccessForm = { accessKey: string };
const fmt = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="adm-skeletons" aria-label="Carregando" aria-busy="true">{Array.from({ length: rows }, (_, i) => <i key={i} />)}</div>;
}

function ErrorNotice({ retry, message = 'Não foi possível carregar esta tela.' }: { retry: () => void; message?: string }) {
  return <div className="adm-notice adm-error" role="alert"><AlertTriangle size={18} /><span>{message}</span><Button variant="outline" size="sm" onClick={retry} data-testid="button-retry">Tentar novamente</Button></div>;
}

function StatusPill({ status }: { status: AdminAuctionSummary['status'] }) {
  const labels: Record<AdminAuctionSummary['status'], string> = { live: 'Ao vivo', ended: 'Encerrado', upcoming: 'Agendado' };
  return <span className={`adm-status is-${status}`} data-testid={`status-auction-${status}`}><i />{labels[status]}</span>;
}

function AuctionRow({ auction }: { auction: AdminAuctionSummary }) {
  return <Link href={`/admin/auctions/${auction.id}`} className="adm-auction-row" data-testid={`link-auction-${auction.id}`}>
    <span className="adm-row-id">#{auction.id}</span>
    <span className="adm-row-prize">{money.format(auction.prize)}</span>
    <span className="adm-row-leader">{auction.leader || 'Sem lances'}</span>
    <span className="adm-row-bids">{fmt.format(auction.bidCount)} lances</span>
    <StatusPill status={auction.status} /><ChevronRight size={16} className="adm-chevron" />
  </Link>;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const form = useForm<AccessForm>({ defaultValues: { accessKey: '' } });
  const login = usePostAdminSession();
  const submit = form.handleSubmit((values) => login.mutate({ data: values }, {
    onSuccess: () => onSuccess(),
    onError: () => form.setError('root', { message: 'A chave de acesso não foi aceita. Confira e tente novamente.' }),
  }));
  return <div className="adm-login-wrap">
    <section className="adm-login-card">
      <div className="adm-login-icon"><KeyRound size={21} /></div>
      <p className="adm-eyebrow">LANCE CASH / OPERAÇÕES</p>
      <h1>Acesso da equipe</h1>
      <p className="adm-login-copy">Informe a chave de acesso compartilhada para abrir o painel de controle.</p>
      <Form {...form}>
        <form onSubmit={submit} className="adm-login-form">
          <FormField control={form.control} name="accessKey" rules={{ required: 'Informe sua chave de acesso.', minLength: { value: 32, message: 'A chave de acesso deve ter pelo menos 32 caracteres.' } }} render={({ field }) => (
            <FormItem>
              <FormLabel>Chave de acesso</FormLabel>
              <FormControl><input {...field} type="password" autoComplete="current-password" placeholder="Cole a chave de acesso" data-testid="input-admin-access-key" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          {form.formState.errors.root && <div className="adm-form-error" role="alert">{form.formState.errors.root.message}</div>}
          <Button type="submit" className="adm-primary-button" disabled={login.isPending} data-testid="button-admin-sign-in">
            {login.isPending ? <LoaderCircle className="adm-spin" size={16} /> : <ShieldCheck size={16} />}
            {login.isPending ? 'Validando chave…' : 'Acessar painel'}
          </Button>
        </form>
      </Form>
      <div className="adm-login-foot"><LockKeyRoundIcon /> Sessão protegida por cookie seguro</div>
    </section>
  </div>;
}

function LockKeyRoundIcon() { return <KeyRound size={13} aria-hidden="true" />; }

function AdminShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const session = useGetAdminSession({ query: { retry: false } });
  const logout = useDeleteAdminSession();
  const authenticated = Boolean(session.data?.authenticated);
  const loginSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
  };
  if (session.isLoading) return <main className="adm-root"><div className="adm-frame"><Skeleton rows={5} /></div></main>;
  if (session.isError && (session.error as { status?: number }).status !== 401) {
    return <main className="adm-root"><div className="adm-frame"><ErrorNotice retry={() => void session.refetch()} message="Unable to verify operator session." /></div></main>;
  }
  if (!authenticated) return <main className="adm-root adm-auth-root"><header className="adm-auth-brand"><span className="adm-brand-mark">LC</span><b>Lance Cash</b><span>Operator console</span></header><AdminLogin onSuccess={loginSuccess} /></main>;

  return <main className="adm-root">
    <div className="adm-frame">
      <header className="adm-topbar">
        <Link href="/admin" className="adm-brand" data-testid="link-admin-home"><span className="adm-brand-mark">LC</span><span>Lance Cash<small>CONTROL ROOM</small></span></Link>
        <nav className="adm-nav" aria-label="Admin navigation">
          <Link href="/admin" className={`adm-nav-link${location === '/admin' ? ' active' : ''}`} data-testid="nav-overview">Overview</Link>
          <Link href="/admin/previous" className={`adm-nav-link${location === '/admin/previous' ? ' active' : ''}`} data-testid="nav-previous">Previous</Link>
          <Link href="/admin/upcoming" className={`adm-nav-link${location === '/admin/upcoming' ? ' active' : ''}`} data-testid="nav-upcoming">Upcoming</Link>
        </nav>
        <Button variant="ghost" size="sm" className="adm-logout" onClick={() => logout.mutate(undefined, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); navigate('/admin'); } })} disabled={logout.isPending} data-testid="button-admin-logout">
          <LogOut size={15} /><span>Sign out</span>
        </Button>
      </header>
      <div className="adm-content">{children}</div>
      <footer className="adm-footer"><span>LC / ADMIN</span><span>Live operations · secure session</span></footer>
    </div>
  </main>;
}

function AuctionList({ auctions, title, detail, empty }: { auctions: AdminAuctionSummary[]; title: string; detail: string; empty: string }) {
  return <section className="adm-list-panel">
    <div className="adm-section-head"><div><p className="adm-eyebrow">{detail}</p><h2>{title}</h2></div><span className="adm-count">{auctions.length} records</span></div>
    {auctions.length ? <div className="adm-auction-list">{auctions.map((auction) => <AuctionRow key={auction.id} auction={auction} />)}</div> : <div className="adm-empty"><CalendarClock size={20} /><p>{empty}</p></div>}
  </section>;
}

function SystemSettings({ enabled, onClose }: { enabled: boolean; onClose: () => void }) {
  const [nextValue, setNextValue] = useState(enabled);
  const queryClient = useQueryClient();
  const settings = useUpdateAdminSystemBidsSettings();
  useEffect(() => setNextValue(enabled), [enabled]);
  const save = () => settings.mutate({ data: { enabled: nextValue } }, {
    onSuccess: (result) => {
      queryClient.setQueryData(getGetAdminOverviewQueryKey(), (current: ReturnType<typeof useGetAdminOverview>['data']) => current ? { ...current, systemBidsEnabled: result.enabled } : current);
      void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
      onClose();
    },
  });
  return <DialogContent className="adm-dialog">
    <DialogHeader><p className="adm-eyebrow">AUTOMATION / SETTINGS</p><DialogTitle>System bids</DialogTitle><DialogDescription>Control automated bidding for the live auction.</DialogDescription></DialogHeader>
    <div className="adm-switch-row">
      <div>
        <strong>Automated bidding</strong>
        <p>{nextValue ? 'System bids are enabled.' : 'System bids are paused.'}</p>
      </div>
      <div className="adm-switch-control">
        <Switch
          checked={nextValue}
          onCheckedChange={setNextValue}
          aria-label={nextValue ? 'Disable automated system bids' : 'Enable automated system bids'}
          data-testid="switch-system-bids"
        />
      </div>
    </div>
    {settings.isError && <div className="adm-form-error" role="alert">Could not save this setting. Try again.</div>}
    <DialogFooter><Button variant="outline" onClick={onClose} data-testid="button-cancel-settings">Cancel</Button><Button className="adm-primary-button" onClick={save} disabled={settings.isPending || nextValue === enabled} data-testid="button-save-system-bids">{settings.isPending ? 'Saving…' : 'Save setting'}</Button></DialogFooter>
  </DialogContent>;
}

export function AdminOverviewPage() {
  const overview = useGetAdminOverview();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return <AdminShell><>
    <div className="adm-page-heading"><div><p className="adm-eyebrow">LIVE AUCTION / COMMAND</p><h1>Overview<span className="adm-live-pip" /></h1><p>One auction, all the signal you need.</p></div><span className="adm-updated"><CircleDot size={13} /> Live monitoring</span></div>
    {overview.isLoading ? <Skeleton rows={6} /> : overview.isError ? <ErrorNotice retry={() => void overview.refetch()} /> : overview.data ? <>
      {overview.data.currentAuction ? <section className="adm-live-card" data-testid="panel-current-auction">
        <div className="adm-live-top"><div><p className="adm-eyebrow">CURRENT AUCTION <span className="adm-divider">/</span> #{overview.data.currentAuction.id}</p><StatusPill status={overview.data.currentAuction.status} /></div><span className="adm-live-indicator"><i /> LIVE EVENT</span></div>
        <div className="adm-prize">{money.format(overview.data.currentAuction.prize)}<span> prize</span></div>
        <div className="adm-live-grid">
          <div className="adm-live-metric"><span>Bid activity</span><strong data-testid="text-current-bid-count">{fmt.format(overview.data.currentAuction.bidCount)}</strong><small>bids placed</small></div>
          <div className="adm-live-metric"><span>Live watchers</span><strong data-testid="text-watcher-count">{fmt.format(overview.data.watcherCount)}</strong><small><Users size={13} /> viewing now</small></div>
          <div className="adm-live-metric"><span>Current leader</span><strong className="adm-leader" data-testid="text-current-leader">{overview.data.currentAuction.leader || 'No bids yet'}</strong><small>leading bidder</small></div>
        </div>
        <div className="adm-live-bottom"><span><Clock3 size={14} /> Started {dateTime(overview.data.currentAuction.startedAt)}</span><Link href={`/admin/auctions/${overview.data.currentAuction.id}`} className="adm-detail-link" data-testid="link-current-auction-bids">Open bid history <ArrowRight size={15} /></Link></div>
      </section> : <div className="adm-empty adm-current-empty"><CircleDot size={22} /><div><strong>No live auction</strong><p>The control room is ready when the next auction begins.</p></div></div>}
      <details className="adm-advanced" open>
        <summary><span className="adm-advanced-icon"><Bot size={17} /></span><span className="adm-advanced-copy"><b>Automated system bids</b><small>Advanced controls · review before changing</small></span><span className="adm-auto-count"><strong>{fmt.format(overview.data.automatedBidCount)}</strong><small>total bids</small></span><span className={`adm-enabled ${overview.data.systemBidsEnabled ? 'on' : ''}`}><i />{overview.data.systemBidsEnabled ? 'Enabled' : 'Paused'}</span><Settings2 size={17} className="adm-settings-icon" /></summary>
        <div className="adm-advanced-detail"><p>System bids are {overview.data.systemBidsEnabled ? 'currently participating in the auction.' : 'not participating in the auction.'} Changing this setting affects automated bidding only.</p><Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} data-testid="button-open-system-bid-settings"><Settings2 size={14} /> Configure</Button><SystemSettings enabled={overview.data.systemBidsEnabled} onClose={() => setSettingsOpen(false)} /></Dialog></div>
      </details>
      <div className="adm-lists-grid">
        <AuctionList title="Previous auctions" detail="ARCHIVE" empty="No completed auctions yet." auctions={overview.data.previousAuctions.slice(0, 5)} />
        <AuctionList title="Upcoming queue" detail="SCHEDULE" empty="No auctions are scheduled." auctions={overview.data.upcomingAuctions.slice(0, 5)} />
      </div>
      <div className="adm-list-links"><Link href="/admin/previous" data-testid="link-all-previous">All previous auctions <ArrowRight size={14} /></Link><Link href="/admin/upcoming" data-testid="link-all-upcoming">Full upcoming queue <ArrowRight size={14} /></Link></div>
    </> : null}
  </></AdminShell>;
}

function AuctionCollection({ status }: { status: 'ended' | 'upcoming' }) {
  const [cursor, setCursor] = useState<number | undefined>();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const params: GetAdminAuctionsParams = { status, ...(cursor ? { cursor } : {}), limit: 20 };
  const query = useGetAdminAuctions(params, { query: { queryKey: getGetAdminAuctionsQueryKey(params) } });
  const pageIndex = Math.max(0, cursors.length - 1);
  const goNext = () => {
    if (!query.data?.hasMore || query.data.nextCursor == null) return;
    setCursors((old) => [...old, query.data!.nextCursor!]);
    setCursor(query.data.nextCursor);
  };
  const goPrev = () => {
    if (pageIndex <= 0) return;
    setCursors((old) => old.slice(0, -1));
    setCursor(cursors[pageIndex - 1]);
  };
  const [, navigate] = useLocation();
  return <AdminShell><>
    <button className="adm-back" onClick={() => navigate('/admin')} data-testid="button-back-overview"><ArrowLeft size={15} /> Back to overview</button>
    <div className="adm-page-heading"><div><p className="adm-eyebrow">AUCTION DIRECTORY / {status === 'ended' ? 'ARCHIVE' : 'SCHEDULE'}</p><h1>{status === 'ended' ? 'Previous auctions' : 'Upcoming auctions'}</h1><p>{status === 'ended' ? 'Completed events and their bid histories.' : 'The scheduled events in the queue.'}</p></div></div>
    <section className="adm-list-panel adm-directory">
      <div className="adm-directory-head"><span>Auction</span><span>Prize</span><span>Leader</span><span>Activity</span><span>Status</span></div>
      {query.isLoading ? <Skeleton rows={7} /> : query.isError ? <ErrorNotice retry={() => void query.refetch()} /> : (query.data?.auctions.length ?? 0) === 0 ? <div className="adm-empty"><CalendarClock size={20} /><p>No {status === 'ended' ? 'previous' : 'upcoming'} auctions found.</p></div> : query.data!.auctions.map((auction) => <AuctionRow key={auction.id} auction={auction} />)}
      <div className="adm-pagination"><Button variant="outline" size="sm" onClick={goPrev} disabled={pageIndex === 0 || query.isFetching} data-testid="button-auctions-previous"><ArrowLeft size={14} /> Previous</Button><span>Page {pageIndex + 1}</span><Button variant="outline" size="sm" onClick={goNext} disabled={!query.data?.hasMore || query.isFetching} data-testid="button-auctions-next">Next <ArrowRight size={14} /></Button></div>
    </section>
  </></AdminShell>;
}

export function AdminPreviousPage() { return <AuctionCollection status="ended" />; }
export function AdminUpcomingPage() { return <AuctionCollection status="upcoming" />; }

export function AdminAuctionDetailPage() {
  const params = useParams<{ auctionId: string }>();
  const auctionId = Number(params.auctionId);
  const [search, setSearch] = useState('');
  const [before, setBefore] = useState<number | undefined>();
  const [olderCursors, setOlderCursors] = useState<number[]>([]);
  const [bids, setBids] = useState<AdminAuctionBid[]>([]);
  const queryParams = useMemo(() => ({ auctionId, ...(search.trim() ? { search: search.trim() } : {}), ...(before ? { before } : {}), limit: 30 }), [auctionId, before, search]);
  const history = useGetAdminAuctionBids(queryParams, { query: { queryKey: getGetAdminAuctionBidsQueryKey(queryParams), enabled: Number.isInteger(auctionId) && auctionId > 0 } });
  const [, navigate] = useLocation();
  useEffect(() => { setBids([]); setBefore(undefined); setOlderCursors([]); }, [auctionId, search]);
  useEffect(() => {
    if (!history.data) return;
    setBids((current) => before ? [...current, ...history.data!.bids.filter((bid) => !current.some((loaded) => loaded.id === bid.id))] : history.data!.bids);
  }, [before, history.data]);
  const loadOlder = () => {
    if (!history.data?.hasMore || history.data.nextBefore == null) return;
    setOlderCursors((current) => [...current, history.data!.nextBefore!]);
    setBefore(history.data.nextBefore);
  };
  return <AdminShell><>
    <button className="adm-back" onClick={() => navigate('/admin')} data-testid="button-back-overview"><ArrowLeft size={15} /> Back to overview</button>
    <div className="adm-page-heading adm-detail-heading"><div><p className="adm-eyebrow">AUCTION / BID LEDGER</p><h1>{history.data ? money.format(history.data.auction.prize) : `Auction #${auctionId}`} <span className="adm-heading-id">#{auctionId}</span></h1><p>Search and inspect the complete bid history.</p></div>{history.data && <StatusPill status={history.data.auction.status} />}</div>
    <section className="adm-history-panel">
      {history.data && <div className="adm-history-summary"><span><b>{fmt.format(history.data.auction.bidCount)}</b> total bids</span><span>Leader <b>{history.data.auction.leader || '—'}</b></span><span>Started {dateTime(history.data.auction.startedAt)}</span></div>}
      <label className="adm-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bidder, bid number, or system bid" aria-label="Search bid history" data-testid="input-search-bids" />{search && <button onClick={() => setSearch('')} type="button" data-testid="button-clear-bid-search">Clear</button>}<kbd>/</kbd></label>
      {history.isLoading ? <Skeleton rows={7} /> : history.isError ? <ErrorNotice retry={() => void history.refetch()} /> : bids.length === 0 ? <div className="adm-empty"><Search size={20} /><p>{search ? 'No bids match this search.' : 'No bids have been placed in this auction.'}</p></div> : <>
        <div className="adm-bid-table-wrap"><table className="adm-bid-table"><thead><tr><th>Bid</th><th>Bidder</th><th>Type</th><th>Placed</th></tr></thead><tbody>{bids.map((bid) => <tr key={bid.id} data-testid={`row-bid-${bid.id}`}><td><span className="adm-bid-number">#{fmt.format(bid.number)}</span></td><td className="adm-bidder">{bid.leader}</td><td><span className={`adm-bid-type ${bid.isSystem ? 'system' : ''}`}>{bid.isSystem ? <><Bot size={13} /> System</> : 'Manual'}</span></td><td className="adm-bid-date">{dateTime(bid.createdAt)}</td></tr>)}</tbody></table></div>
        {history.data?.hasMore && <div className="adm-load-older"><Button variant="outline" onClick={loadOlder} disabled={history.isFetching} data-testid="button-load-older-bids"><ArrowDown size={15} />{history.isFetching ? 'Loading older bids…' : 'Load older bids'}</Button><span>{olderCursors.length ? `${olderCursors.length} older page${olderCursors.length === 1 ? '' : 's'} loaded` : 'Most recent bids first'}</span></div>}
      </>}
      {history.isFetching && !history.isLoading && <div className="adm-search-loading"><LoaderCircle size={14} className="adm-spin" /> Updating results</div>}
    </section>
  </></AdminShell>;
}
