import { memo, type FormEvent, type MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, LogIn, Plus, X, Zap } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetLanceCashAuctionBidsQueryKey,
  getGetAuthMeQueryKey,
  getGetLanceCashStateQueryKey,
  useGetLanceCashAuctionBids,
  useGetAuthMe,
  useGetLanceCashState,
  useHealthCheck,
  usePostAuthLogin,
  usePostAuthLogout,
  usePostAuthRegister,
  usePlaceLanceCashBid,
  usePurchaseLancePackage,
  useRedeemLanceCashPrize,
  useUpdateLanceCashProfile,
} from '@workspace/api-client-react';
import type {
  AuctionBid,
  LanceCashAuction,
  LanceCashPrize,
  LanceCashState,
  LancePackage,
  ProfileUpdateInput,
} from '@workspace/api-client-react';
import { useAuctionRealtime, type AuctionRealtimeUpdate } from '@/hooks/use-auction-realtime';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { BidRow, LogoMark, TrophyMark } from '@/design-system';
import './lance-cash.css';

type CountdownConnectionState = 'healthy' | 'delayed' | 'disconnected' | 'sync-error';

const queryClient = new QueryClient();
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMBER = new Intl.NumberFormat('pt-BR');
const INCOMING_BID_FEEDBACK_MS = 1000;
const INCOMING_BID_FADE_MS = 150;

function apiErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data;
    if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function LoadingView() {
  return (
    <main className="lc-app" aria-label="Carregando leilões" aria-busy="true">
      <header className="lc-header">
        <div className="lc-brand"><LogoMark /> Lance Cash</div>
        <div className="lc-actions">
          <span className="lc-skel lc-skel-header-login" aria-hidden="true" />
        </div>
      </header>

      <nav className="lc-pager" aria-hidden="true">
        <span className="lc-pager-button"><span className="lc-skel lc-skel-pager-control" /></span>
        <div className="lc-pager-caption">
          <span className="lc-skel lc-skel-pager-line" />
          <div className="lc-dots">
            <span className="lc-skel lc-skel-dot" />
            <span className="lc-skel lc-skel-dot" />
            <span className="lc-skel lc-skel-dot lc-skel-dot-selected" />
            <span className="lc-skel lc-skel-dot" />
            <span className="lc-skel lc-skel-dot" />
          </div>
        </div>
        <span className="lc-pager-button"><span className="lc-skel lc-skel-pager-control" /></span>
      </nav>

      <div className="lc-slides" aria-hidden="true">
        <section className="lc-slide">
          <div className="lc-slide-inner">
            <h1 className="lc-prize lc-loading-prize">
              <span className="lc-skel lc-skel-currency" />
              <span className="lc-skel lc-skel-prize-value" />
            </h1>

            <section className="lc-loading-current">
              <span className="lc-skel lc-skel-current-ring" />
              <div className="lc-loading-current-copy">
                <span className="lc-skel lc-skel-kicker" />
                <span className="lc-skel lc-skel-leader" />
                <span className="lc-skel lc-skel-subline" />
              </div>
            </section>

            <h2 className="lc-section-title">
              <span className="lc-skel lc-skel-bid-title" />
              <span className="lc-skel lc-skel-bid-count" />
            </h2>

            <ol className="lc-bid-list">
              {Array.from({ length: 8 }, (_, index) => (
                <li className="lc-bid-row" key={index}>
                  <span className="lc-skel lc-skel-avatar" />
                  <div className="lc-bid-meta">
                    <span className="lc-skel lc-skel-bid-name" />
                    <span className="lc-skel lc-skel-bid-number" />
                  </div>
                  <span className="lc-skel lc-skel-bid-time" />
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      <footer className="lc-footer" aria-hidden="true">
        <p><span className="lc-skel lc-skel-footer-copy" /></p>
        <div className="lc-cta lc-skel lc-skel-footer-button" />
      </footer>
    </main>
  );
}

const AuctionCountdown = memo(function AuctionCountdown({
  auctionId,
  status,
  deadlineAt,
  serverOffsetRef,
  isVerifying,
  isSyncUnconfirmed,
  connectionState,
  onDeadline,
}: {
  auctionId: number;
  status: 'live' | 'ended' | 'upcoming';
  deadlineAt: string | null;
  serverOffsetRef: MutableRefObject<number>;
  isVerifying: boolean;
  isSyncUnconfirmed: boolean;
  connectionState: CountdownConnectionState;
  onDeadline: (auctionId: number, deadlineAt: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== 'live' || !deadlineAt) return;

    setNow(Date.now());
    if (isSyncUnconfirmed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt, isSyncUnconfirmed, status]);

  const remainingMs = status === 'live' && deadlineAt
    ? Math.max(0, Date.parse(deadlineAt) - (now + serverOffsetRef.current))
    : 0;
  const seconds = status === 'upcoming' ? 15 : Math.ceil(remainingMs / 1000);
  const ringProgress = status === 'live' ? Math.min(100, (remainingMs / 15_000) * 100) : 0;
  const deadlineReached = status === 'live' && Boolean(deadlineAt) && remainingMs === 0;
  const showVerification = isVerifying || deadlineReached;
  const isLow = status === 'live' && seconds < 5 && !showVerification && connectionState === 'healthy';

  useEffect(() => {
    if (deadlineReached && deadlineAt) onDeadline(auctionId, deadlineAt);
  }, [auctionId, deadlineAt, deadlineReached, onDeadline]);

  return (
    <div className={`lc-ring${isLow ? ' is-low' : ''}${showVerification ? ' is-verifying' : ''}${status === 'live' && connectionState !== 'healthy' ? ` is-${connectionState}` : ''}`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="ring-bg" cx="20" cy="20" r="17" />
        <circle className="ring-fill" cx="20" cy="20" r="17" pathLength="100" style={{ strokeDashoffset: 100 - ringProgress }} />
      </svg>
      {status === 'ended' ? (
        <span className="lc-ring-check" role="img" aria-label="Leilão encerrado">
          <Check size={22} strokeWidth={3} />
        </span>
      ) : (
        <b role="timer" aria-label={showVerification ? 'Verificando o resultado com o servidor' : `${seconds} segundos restantes`}>
          {showVerification ? '…' : seconds}
        </b>
      )}
    </div>
  );
});

function LanceCash() {
  const queryClient = useQueryClient();
  const authQuery = useGetAuthMe({ query: { retry: false, refetchInterval: 60_000 } });
  const isAuthenticated = Boolean(authQuery.data?.user) && apiErrorStatus(authQuery.error) !== 401;
  const serverOffsetRef = useRef(0);
  const handleAuctionUpdate = useCallback((event: AuctionRealtimeUpdate) => {
    serverOffsetRef.current = Date.parse(event.serverTime) - Date.now();

    let shouldRefreshState = false;
    const queryKey = getGetLanceCashStateQueryKey();
    void queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<LanceCashState>(queryKey, (current) => {
      if (!current) {
        shouldRefreshState = true;
        return current;
      }

      const existing = current.auctions.find((auction) => auction.id === event.auctionId);
      if (existing && event.bidCount < existing.bidCount) return current;
      if (existing && event.bidCount > existing.bidCount + 1) shouldRefreshState = true;
      if (!existing && event.status !== 'upcoming') {
        shouldRefreshState = true;
        return current;
      }

      const publicLeader = !isAuthenticated && event.leader === 'Você'
        ? 'Participante'
        : event.leader;
      const incomingBid = event.bid
        ? {
          ...event.bid,
          leader: !isAuthenticated && event.bid.leader === 'Você'
            ? 'Participante'
            : event.bid.leader,
        }
        : null;
      const bids = incomingBid
        ? [
          incomingBid,
          ...(existing?.bids ?? []).filter((bid) => bid.number !== incomingBid.number),
        ].sort((a, b) => b.number - a.number).slice(0, 12)
        : existing?.bids ?? [];
      const updatedAuction: LanceCashAuction = {
        id: event.auctionId,
        prize: event.prize,
        status: event.status,
        bidCount: event.bidCount,
        leader: publicLeader,
        startedAt: event.startedAt,
        deadlineAt: event.deadlineAt,
        usedBids: existing?.usedBids ?? 0,
        bids,
        historyHasMore: event.bidCount > bids.length,
      };
      const auctions = existing
        ? current.auctions.map((auction) => auction.id === event.auctionId ? updatedAuction : auction)
        : [...current.auctions, updatedAuction].sort((a, b) => a.id - b.id);

      return {
        ...current,
        currentAuctionId: event.currentAuctionId,
        auctions,
      };
    });

    if (shouldRefreshState) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [isAuthenticated, queryClient]);
  const realtimeConnected = useAuctionRealtime(handleAuctionUpdate);
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const updateOnlineStatus = () => setBrowserOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);
  const [verificationTarget, setVerificationTarget] = useState<{
    auctionId: number;
    deadlineAt: string;
  } | null>(null);
  const verificationTargetRef = useRef<typeof verificationTarget>(null);
  const requestDeadlineVerification = useCallback((auctionId: number, deadlineAt: string) => {
    const current = verificationTargetRef.current;
    if (current?.auctionId === auctionId && current.deadlineAt === deadlineAt) return;

    const target = { auctionId, deadlineAt };
    verificationTargetRef.current = target;
    setVerificationTarget(target);
    void queryClient.invalidateQueries({ queryKey: getGetLanceCashStateQueryKey() });
  }, [queryClient]);
  const stateQuery = useGetLanceCashState({
    query: {
      refetchInterval: (query) => {
        if (!verificationTarget) return realtimeConnected ? 15_000 : 3_000;
        return query.state.status === 'error' ? 5_000 : 3_000;
      },
    },
  });
  const hasStateSyncError = stateQuery.isError && Boolean(stateQuery.data);
  const serverConnectionLost = !browserOnline || !realtimeConnected && hasStateSyncError;
  const stateSyncFailed = browserOnline && realtimeConnected && hasStateSyncError;
  const isStateUnverified = serverConnectionLost || stateSyncFailed;
  const countdownConnectionState: CountdownConnectionState = serverConnectionLost ? 'disconnected'
    : stateSyncFailed ? 'sync-error'
      : realtimeConnected ? 'healthy' : 'delayed';
  useHealthCheck();
  const state = stateQuery.data as LanceCashState | undefined;
  const hasAccountData =
    isAuthenticated &&
    state !== undefined &&
    state.user !== null &&
    state.user.name.trim().length > 0 &&
    Number.isFinite(state.balance);
  const auctions = state?.auctions ?? [];
  const currentIndex = Math.max(0, auctions.findIndex((auction) => auction.id === state?.currentAuctionId));
  const currentAuction = auctions[currentIndex];
  useEffect(() => {
    if (!verificationTarget || !state) return;
    const checkedAuction = state.auctions.find((auction) => auction.id === verificationTarget.auctionId);
    if (
      !checkedAuction ||
      checkedAuction.status !== 'live' ||
      checkedAuction.deadlineAt !== verificationTarget.deadlineAt
    ) {
      verificationTargetRef.current = null;
      setVerificationTarget(null);
    }
  }, [state, verificationTarget]);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [historyRequest, setHistoryRequest] = useState<{ auctionId: number; before: number } | null>(null);
  const [historyExtra, setHistoryExtra] = useState<Record<number, AuctionBid[]>>({});
  const [historyHasMoreByAuction, setHistoryHasMoreByAuction] = useState<Record<number, boolean>>({});
  const [selectedPackageId, setSelectedPackageId] = useState('popular');
  const [toastText, setToastText] = useState('');
  const [incomingBid, setIncomingBid] = useState<{ auctionId: number; bidNumber: number } | null>(null);
  const [accountView, setAccountView] = useState<'main' | 'prizes' | 'profile'>('main');
  const [accountNotice, setAccountNotice] = useState('');
  const [authMode, setAuthMode] = useState<'in' | 'up'>('in');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authErrors, setAuthErrors] = useState<Record<string, string>>({});
  const [authNotice, setAuthNotice] = useState('');
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [toastTimer, setToastTimer] = useState<number | null>(null);
  const [offsetScroll, setOffsetScroll] = useState<number | null>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  const bidListRefs = useRef(new Map<number, HTMLOListElement>());
  const historySentinelRefs = useRef(new Map<number, HTMLLIElement>());
  const purchaseDialogRef = useRef<HTMLDialogElement>(null);
  const accountDialogRef = useRef<HTMLDialogElement>(null);
  const authDialogRef = useRef<HTMLDialogElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const initializedAuctionRef = useRef<number | null>(null);
  const packageRequestRef = useRef<{ packageId: string; requestId: string } | null>(null);
  const lastBidCountByAuctionRef = useRef<Map<number, number> | null>(null);
  const incomingBidTimerRef = useRef<number | null>(null);
  const hasConnectedRealtimeRef = useRef(false);

  const visibleAuction = auctions[visibleIndex] ?? currentAuction;
  const historyParams = {
    auctionId: historyRequest?.auctionId ?? visibleAuction?.id ?? state?.currentAuctionId ?? 1,
    before: historyRequest?.before ?? 1,
  };
  const historyQuery = useGetLanceCashAuctionBids(historyParams, {
    query: {
      queryKey: getGetLanceCashAuctionBidsQueryKey(historyParams),
      enabled: historyRequest !== null,
    },
  });
  const historyBusy = historyRequest !== null && historyQuery.isFetching;
  const requestOlderBids = useCallback((auction: LanceCashAuction) => {
    if (auction.status === 'upcoming' || historyRequest !== null || historyQuery.isFetching) return;

    const loaded = [
      ...(historyExtra[auction.id] ?? []),
      ...auction.bids,
    ];
    const oldest = loaded.length
      ? Math.min(...loaded.map((bid) => bid.number))
      : 1;
    const hasMore = historyHasMoreByAuction[auction.id] ?? auction.historyHasMore;
    if (hasMore && oldest > 1) {
      setHistoryRequest({ auctionId: auction.id, before: oldest });
    }
  }, [historyExtra, historyHasMoreByAuction, historyQuery.isFetching, historyRequest]);
  const bidMutation = usePlaceLanceCashBid();
  const packageMutation = usePurchaseLancePackage();
  const profileMutation = useUpdateLanceCashProfile();
  const redeemMutation = useRedeemLanceCashPrize();
  const loginMutation = usePostAuthLogin();
  const registerMutation = usePostAuthRegister();
  const logoutMutation = usePostAuthLogout();

  useEffect(() => {
    if (!realtimeConnected) return;
    if (!hasConnectedRealtimeRef.current) {
      hasConnectedRealtimeRef.current = true;
      return;
    }
    const queryKey = getGetLanceCashStateQueryKey();
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, realtimeConnected]);

  useEffect(() => {
    if (state?.serverTime) serverOffsetRef.current = Date.parse(state.serverTime) - Date.now();
  }, [state?.serverTime]);

  useLayoutEffect(() => {
    if (!state) return;

    const previousCounts = lastBidCountByAuctionRef.current;
    const activeAuction = state.auctions.find(
      (auction) => auction.id === state.currentAuctionId && auction.status === 'live',
    );
    const previousCount = activeAuction ? previousCounts?.get(activeAuction.id) : undefined;

    if (activeAuction && previousCount !== undefined && activeAuction.bidCount > previousCount) {
      setIncomingBid({ auctionId: activeAuction.id, bidNumber: activeAuction.bidCount });
      if (incomingBidTimerRef.current !== null) window.clearTimeout(incomingBidTimerRef.current);
      incomingBidTimerRef.current = window.setTimeout(() => {
        setIncomingBid(null);
        incomingBidTimerRef.current = null;
      }, INCOMING_BID_FEEDBACK_MS - INCOMING_BID_FADE_MS);
    }

    lastBidCountByAuctionRef.current = new Map(
      state.auctions.map((auction) => [
        auction.id,
        Math.max(previousCounts?.get(auction.id) ?? auction.bidCount, auction.bidCount),
      ]),
    );
  }, [state?.auctions, state?.currentAuctionId]);

  useEffect(() => () => {
    if (toastTimer) window.clearTimeout(toastTimer);
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
  }, [toastTimer]);

  useEffect(() => () => {
    if (incomingBidTimerRef.current !== null) window.clearTimeout(incomingBidTimerRef.current);
  }, []);

  useEffect(() => {
    if (apiErrorStatus(authQuery.error) !== 401) return;
    accountDialogRef.current?.close();
    queryClient.removeQueries({ queryKey: ['/api/lance-cash/bids/history'] });
    void queryClient.invalidateQueries({ queryKey: getGetLanceCashStateQueryKey() });
  }, [authQuery.error, queryClient]);

  useEffect(() => {
    setHistoryExtra({});
    setHistoryHasMoreByAuction({});
    setHistoryRequest(null);
    queryClient.removeQueries({ queryKey: ['/api/lance-cash/bids/history'] });
  }, [isAuthenticated ? authQuery.data?.user.id : null, isAuthenticated, queryClient]);

  useEffect(() => {
    if (!visibleAuction || visibleAuction.status === 'upcoming' || typeof IntersectionObserver === 'undefined') return;
    const sentinel = historySentinelRefs.current.get(visibleAuction.id);
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        requestOlderBids(visibleAuction);
      }
    }, { root: null, rootMargin: '160px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    visibleAuction?.id,
    visibleAuction?.status,
    visibleAuction?.bidCount,
    visibleAuction?.bids,
    visibleAuction?.historyHasMore,
    requestOlderBids,
  ]);

  useEffect(() => {
    if (!state) return;
    const previousId = initializedAuctionRef.current;
    if (previousId === null) {
      initializedAuctionRef.current = state.currentAuctionId;
      setVisibleIndex(currentIndex);
      setOffsetScroll(currentIndex);
      return;
    }
    if (previousId !== state.currentAuctionId) {
      const previousIndex = auctions.findIndex((auction) => auction.id === previousId);
      initializedAuctionRef.current = state.currentAuctionId;
      if (visibleIndex === previousIndex) {
        setVisibleIndex(currentIndex);
        setOffsetScroll(currentIndex);
      }
    }
  }, [state?.currentAuctionId, currentIndex, visibleIndex, auctions]);

  useEffect(() => {
    if (offsetScroll !== null && slidesRef.current) {
      slidesRef.current.scrollLeft = offsetScroll * slidesRef.current.clientWidth;
      setOffsetScroll(null);
    }
  }, [offsetScroll]);

  useEffect(() => {
    if (historyRequest === null || !historyQuery.data) return;
    const received = historyQuery.data.bids ?? [];
    setHistoryHasMoreByAuction((existing) => ({
      ...existing,
      [historyRequest.auctionId]: historyQuery.data.hasMore,
    }));
    setHistoryExtra((existing) => {
      const already = new Set(existing[historyRequest.auctionId]?.map((bid) => bid.number) ?? []);
      const unique = received.filter((bid) => !already.has(bid.number));
      return { ...existing, [historyRequest.auctionId]: [...(existing[historyRequest.auctionId] ?? []), ...unique] };
    });
    setHistoryRequest(null);
  }, [historyQuery.data, historyRequest]);

  useLayoutEffect(() => {
    if (!incomingBid || visibleAuction?.id !== incomingBid.auctionId) return;
    const element = bidListRefs.current.get(incomingBid.auctionId);
    if (!element) return;
    const newRow = element.querySelector<HTMLElement>(`[data-bid-number="${incomingBid.bidNumber}"]`);
    if (!newRow) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rowShift = newRow.offsetHeight;
    if (rowShift <= 0) return;
    const rows = Array.from(element.querySelectorAll<HTMLElement>('.lc-bid-row'));
    rows.forEach((row) => {
      row.style.transition = 'none';
      row.style.transform = `translateY(-${rowShift}px)`;
    });
    if (!reducedMotion) newRow.style.opacity = '0';
    void element.offsetHeight;

    const transition = reducedMotion
      ? 'none'
      : 'transform .45s cubic-bezier(.2, .8, .2, 1), opacity .45s ease';
    rows.forEach((row) => {
      row.style.transition = transition;
      row.style.transform = 'translateY(0)';
    });
    if (!reducedMotion) newRow.style.opacity = '1';
  }, [incomingBid, visibleAuction?.id]);

  const patchState = (next: LanceCashState) => {
    queryClient.setQueryData(getGetLanceCashStateQueryKey(), next);
  };

  const showToast = (message: string) => {
    setToastText(message);
    if (toastTimer) window.clearTimeout(toastTimer);
    setToastTimer(window.setTimeout(() => setToastText(''), 2400));
  };

  const scrollToIndex = (index: number) => {
    const element = slidesRef.current;
    if (!element) return;
    const clamped = Math.max(0, Math.min(auctions.length - 1, index));
    element.scrollTo({ left: clamped * element.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const syncVisible = () => {
    if (!slidesRef.current || !auctions.length) return;
    const nextIndex = Math.max(0, Math.min(auctions.length - 1, Math.round(slidesRef.current.scrollLeft / slidesRef.current.clientWidth)));
    setVisibleIndex((old) => old === nextIndex ? old : nextIndex);
  };

  const openPurchase = () => {
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    if (!hasAccountData) return;
    if (!purchaseDialogRef.current?.open) purchaseDialogRef.current?.showModal();
  };
  const openAccount = () => {
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    if (!hasAccountData) return;
    setAccountView('main');
    setAccountNotice('');
    accountDialogRef.current?.showModal();
  };
  const openAuth = () => {
    setAuthMode('in');
    setAuthName('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthErrors({});
    setAuthNotice('');
    setAuthShowPassword(false);
    const showAuth = () => {
      if (!authDialogRef.current?.open) authDialogRef.current?.showModal();
    };
    if (accountDialogRef.current?.open) {
      accountDialogRef.current.close();
      window.requestAnimationFrame(showAuth);
    } else {
      showAuth();
    }
  };
  const changeAuthMode = (mode: 'in' | 'up') => {
    setAuthMode(mode);
    setAuthErrors({});
    setAuthNotice('');
    setAuthPassword('');
  };
  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = authEmail.trim();
    const errors: Record<string, string> = {};
    if (authMode === 'up' && authName.trim().length < 2) errors.name = 'Informe seu nome.';
    if (!email) errors.email = 'Informe seu e-mail.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Digite um e-mail válido.';
    if (!authPassword) errors.password = 'Informe sua senha.';
    else if (authMode === 'up' && authPassword.length < 8) errors.password = 'Use pelo menos 8 caracteres.';
    else if (authPassword.length > 200) errors.password = 'Use uma senha com até 200 caracteres.';
    setAuthErrors(errors);
    setAuthNotice('');
    if (Object.keys(errors).length) return;
    try {
      const result = authMode === 'up'
        ? await registerMutation.mutateAsync({
          data: { name: authName.trim(), email, password: authPassword },
        })
        : await loginMutation.mutateAsync({
          data: { email, password: authPassword },
        });
      queryClient.setQueryData(getGetAuthMeQueryKey(), result);
      queryClient.removeQueries({ queryKey: ['/api/lance-cash/bids/history'] });
      await queryClient.invalidateQueries({ queryKey: getGetLanceCashStateQueryKey() });
      authDialogRef.current?.close();
      showToast(authMode === 'up' ? 'Sua conta foi criada.' : 'Você entrou na sua conta.');
    } catch (error) {
      setAuthNotice(apiErrorMessage(error, 'Não foi possível autenticar sua conta.'));
    }
  };
  const signOut = async () => {
    try {
      await logoutMutation.mutateAsync();
      queryClient.removeQueries({ queryKey: ['/api/lance-cash/bids/history'] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetLanceCashStateQueryKey() }),
      ]);
      accountDialogRef.current?.close();
      showToast('Você saiu da sua conta.');
    } catch (error) {
      showToast(apiErrorMessage(error, 'Não foi possível sair da conta.'));
    }
  };
  const selectedPackage = state?.packages.find((item) => item.id === selectedPackageId) ?? state?.packages[0];
  const placeBid = async () => {
    if (isStateUnverified) return;
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    if (!state || !currentAuction) return;
    if (currentAuction.status === 'ended' && visibleIndex >= currentIndex && visibleIndex <= currentIndex + 1) {
      const targetAuction = visibleIndex === currentIndex
        ? auctions[currentIndex + 1]
        : visibleAuction;
      if (!targetAuction) return;
      try {
        const next = await bidMutation.mutateAsync({
          data: { auctionId: targetAuction.id },
        });
        patchState(next);
        const nextIndex = next.auctions.findIndex((auction) => auction.id === next.currentAuctionId);
        if (nextIndex >= 0) {
          setVisibleIndex(nextIndex);
          setOffsetScroll(nextIndex);
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Não foi possível começar o próximo leilão.');
      }
      return;
    }
    if (visibleIndex !== currentIndex) {
      scrollToIndex(currentIndex);
      return;
    }
    if (state.balance < 1) {
      openPurchase();
      return;
    }
    try {
      const next = await bidMutation.mutateAsync({ data: { auctionId: currentAuction.id } });
      patchState(next);
      if (navigator.vibrate) navigator.vibrate(12);
      window.requestAnimationFrame(() => {
        if (slidesRef.current) setVisibleIndex(Math.round(slidesRef.current.scrollLeft / slidesRef.current.clientWidth));
      });
      announce('Você está na frente');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível dar seu lance.');
    }
  };

  const purchasePackage = async () => {
    if (!selectedPackage || packageMutation.isPending) return;
    try {
      if (!packageRequestRef.current || packageRequestRef.current.packageId !== selectedPackage.id) {
        packageRequestRef.current = {
          packageId: selectedPackage.id,
          requestId: window.crypto.randomUUID(),
        };
      }
      const next = await packageMutation.mutateAsync({
        data: {
          packageId: selectedPackage.id,
          requestId: packageRequestRef.current.requestId,
        },
      });
      patchState(next);
      packageRequestRef.current = null;
      purchaseDialogRef.current?.close();
      showToast(`+${selectedPackage.bids + selectedPackage.bonus} lances no seu saldo`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível confirmar o Pix simulado.');
    }
  };

  const openProfile = () => {
    if (!state?.user) return;
    setProfileName(state.user.name);
    setProfileEmail(state.user.email);
    setPasswordCurrent('');
    setPasswordNew('');
    setPasswordConfirm('');
    setShowPasswords(false);
    setProfileErrors({});
    setAccountView('profile');
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = profileName.trim();
    const email = profileEmail.trim();
    const changingPassword = Boolean(passwordCurrent || passwordNew || passwordConfirm);
    const errors: Record<string, string> = {};
    if (!name) errors.name = 'Informe seu nome.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Informe um e-mail válido.';
    if (changingPassword && !passwordCurrent) errors.current = 'Informe a senha atual.';
    if (changingPassword && passwordNew.length < 8) errors.new = 'A nova senha precisa ter ao menos 8 caracteres.';
    if (changingPassword && passwordNew === passwordCurrent && passwordNew.length >= 8) errors.new = 'A nova senha deve ser diferente da atual.';
    if (changingPassword && passwordConfirm !== passwordNew) errors.confirm = 'As senhas não coincidem.';
    setProfileErrors(errors);
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      document.getElementById(`profile-${firstError}`)?.focus();
      return;
    }
    const update: ProfileUpdateInput = {
      name,
      email,
      ...(changingPassword ? {
        currentPassword: passwordCurrent,
        newPassword: passwordNew,
        confirmPassword: passwordConfirm,
      } : {}),
    };
    setSavingProfile(true);
    try {
      const next = await profileMutation.mutateAsync({ data: update });
      patchState(next);
      await queryClient.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
      setAccountNotice(changingPassword ? 'Dados e senha atualizados.' : 'Dados atualizados.');
      setAccountView('main');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar seus dados.');
    } finally {
      setSavingProfile(false);
    }
  };

  const redeemPrize = async (prize: LanceCashPrize) => {
    if (prize.redeemed || redeemingId !== null) return;
    setRedeemingId(prize.auctionId);
    try {
      const next = await redeemMutation.mutateAsync({ auctionId: prize.auctionId });
      patchState(next);
      announce(`Prêmio de ${BRL2.format(prize.prize)} resgatado`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível resgatar o prêmio.');
    } finally {
      setRedeemingId(null);
    }
  };

  const announce = (message: string) => {
    const live = document.getElementById('lc-live');
    if (live) live.textContent = message;
  };

  const packages = state?.packages ?? [];
  if (authQuery.isLoading || stateQuery.isLoading) return <LoadingView />;
  if (
    authQuery.isError && apiErrorStatus(authQuery.error) !== 401 ||
    stateQuery.isError && !stateQuery.data ||
    !state ||
    !visibleAuction ||
    !currentAuction
  ) {
    return (
      <main className="lc-error">
        <h1>Não foi possível carregar</h1>
        <p>Não conseguimos carregar os leilões ou verificar sua conta agora.</p>
        <button className="lc-cta" type="button" onClick={() => { void stateQuery.refetch(); void authQuery.refetch(); }} data-testid="button-retry-state">Tentar novamente</button>
      </main>
    );
  }

  const hasPrevious = visibleIndex > 0;
  const hasNext = visibleIndex < auctions.length - 1;
  const statusLabel = serverConnectionLost ? 'Desconectado'
    : stateSyncFailed ? 'Falha na sincronização'
      : !realtimeConnected ? 'Atrasado'
        : visibleAuction.status === 'live' ? 'Ao vivo'
          : visibleAuction.status === 'ended' ? 'Encerrado' : 'Em breve';
  const statusTone = serverConnectionLost ? 'is-disconnected'
    : stateSyncFailed ? 'is-sync-error'
      : !realtimeConnected ? 'is-delayed'
        : visibleAuction.status === 'live' ? 'is-live' : 'is-neutral';
  const statusDescription = serverConnectionLost ? 'Desconectado; cronômetro pausado'
    : stateSyncFailed ? 'Falha ao atualizar o estado HTTP; WebSocket ainda conectado'
      : !realtimeConnected ? 'Atualização em tempo real atrasada; sincronização HTTP ativa'
        : visibleAuction.status === 'live' ? 'Leilão ao vivo; servidor conectado'
          : visibleAuction.status === 'ended' ? 'Leilão encerrado; servidor conectado'
            : 'Leilão em breve; servidor conectado';
  const currentLeaderIsUser = currentAuction?.leader === 'Você';
  const currentIsEnded = currentAuction?.status === 'ended';
  const isVisibleCurrent = visibleIndex === currentIndex;
  const isAwaitingVerification = Boolean(
    currentAuction &&
    verificationTarget?.auctionId === currentAuction.id &&
    verificationTarget.deadlineAt === currentAuction.deadlineAt,
  );
  const buttonDisabled = bidMutation.isPending || isAwaitingVerification || isStateUnverified || isAuthenticated && (!hasAccountData || isVisibleCurrent && currentAuction?.status === 'live' && currentLeaderIsUser);
  return (
    <main className="lc-app">
      <header className="lc-header">
        <div className="lc-brand"><LogoMark /> Lance Cash</div>
        <div className="lc-actions">
          {hasAccountData ? (
            <>
              <button className="lc-balance" type="button" onClick={openPurchase} aria-label={`Você tem ${state.balance} ${state.balance === 1 ? 'lance' : 'lances'}. Comprar mais`} data-testid="button-buy-bids">
                <Zap size={16} fill="currentColor" aria-hidden="true" />
                <span data-testid="text-balance">{NUMBER.format(state.balance)} {state.balance === 1 ? 'lance' : 'lances'}</span>
                <span className="lc-plus"><Plus size={16} strokeWidth={3} /></span>
              </button>
              <button className="lc-avatar" type="button" onClick={openAccount} aria-label="Abrir minha conta" aria-haspopup="dialog" data-testid="button-open-account">
                {state.user?.name.trim()[0]?.toUpperCase()}
              </button>
            </>
          ) : !isAuthenticated ? (
            <button className="lc-header-login" type="button" onClick={openAuth} aria-haspopup="dialog" data-testid="button-open-auth">
              <LogIn size={17} strokeWidth={2.5} aria-hidden="true" />
              Entrar
            </button>
          ) : null}
        </div>
      </header>

      <nav className="lc-pager" aria-label="Navegar entre leilões">
        <button className="lc-pager-button" type="button" aria-label="Leilão anterior" disabled={!hasPrevious} onClick={() => scrollToIndex(visibleIndex - 1)} data-testid="button-previous-auction"><ChevronLeft size={20} strokeWidth={3} /></button>
        <div className="lc-pager-caption">
          <span>
            <b data-testid="text-auction-position">Leilão #{NUMBER.format(visibleAuction.id)}</b> ·{' '}
            <span className={`lc-sync-label ${statusTone}`} role="status" aria-label={statusDescription}>
              <i aria-hidden="true" />
              {statusLabel}
            </span>
          </span>
          <div className="lc-dots" aria-hidden="true">
            {auctions.map((auction, index) => <i key={auction.id} className={`${index === visibleIndex ? 'selected ' : ''}${auction.id === state.currentAuctionId ? 'live' : ''}`} />)}
          </div>
        </div>
        <button className="lc-pager-button" type="button" aria-label="Próximo leilão" disabled={!hasNext} onClick={() => scrollToIndex(visibleIndex + 1)} data-testid="button-next-auction"><ChevronRight size={20} strokeWidth={3} /></button>
      </nav>

      <div
        className="lc-slides"
        ref={slidesRef}
        tabIndex={0}
        aria-label="Leilões, deslize para os lados"
        onScroll={() => {
          if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
          scrollFrame.current = window.requestAnimationFrame(syncVisible);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') scrollToIndex(visibleIndex - 1);
          if (event.key === 'ArrowRight') scrollToIndex(visibleIndex + 1);
        }}
      >
        {auctions.map((auction, index) => {
          const ended = auction.status === 'ended';
          const upcoming = auction.status === 'upcoming';
          const mine = auction.leader === 'Você';
          const isActive = auction.status === 'live';
          const prizeFormatted = BRL2.format(auction.prize).replace(/^R\$\s?/, '');
          const auctionBids = [...(historyExtra[auction.id] ?? []), ...auction.bids]
            .reduce((all, bid) => all.set(bid.number, bid), new Map<number, AuctionBid>())
            .values();
          const orderedBids = [...auctionBids].sort((a, b) => b.number - a.number);
          const isIncomingBidVisible = isVisibleCurrent
            && index === currentIndex
            && incomingBid?.auctionId === auction.id
            && incomingBid.bidNumber === auction.bidCount;
          const isVerifyingAuction = verificationTarget?.auctionId === auction.id
            && verificationTarget.deadlineAt === auction.deadlineAt;
          const isCurrentLiveAuction = auction.id === state.currentAuctionId && auction.status === 'live';
          const connectionNotice = isCurrentLiveAuction
            ? serverConnectionLost ? 'Sem conexão — cronômetro pausado'
              : stateSyncFailed ? 'Falha na sincronização — tempo real ativo'
                : !realtimeConnected ? 'Atualização atrasada — sincronizando'
                  : null
            : null;
          const leaderText = upcoming ? 'Em breve'
            : isVerifyingAuction ? 'Verificando resultado…'
              : mine ? ended ? 'Você ganhou!' : 'Você' : auction.leader;
          return (
            <section
              className="lc-slide"
              aria-label={`Leilão #${auction.id}`}
              key={auction.id}
              data-testid={`section-auction-${auction.id}`}
            >
              <div className="lc-slide-inner">
                <h1 className="lc-prize" aria-label={`Prêmio de ${BRL2.format(auction.prize)} em dinheiro`}>
                  <small>R$</small>{prizeFormatted.slice(0, -3)}<small className="decimal">{prizeFormatted.slice(-3)}</small>
                </h1>
                <section className={`lc-current${ended ? ' is-ended' : ''}${mine && !upcoming ? ' is-mine' : ''}${isIncomingBidVisible ? ' is-new-bid' : ''}`} aria-label="Lance atual" data-testid={`status-auction-${auction.id}`}>
                  <AuctionCountdown
                    auctionId={auction.id}
                    status={auction.status}
                    deadlineAt={auction.deadlineAt}
                    serverOffsetRef={serverOffsetRef}
                    isVerifying={isVerifyingAuction}
                    isSyncUnconfirmed={isStateUnverified}
                    connectionState={isCurrentLiveAuction ? countdownConnectionState : 'healthy'}
                    onDeadline={requestDeadlineVerification}
                  />
                  <div className="lc-current-copy">
                    <div className="lc-kicker lc-kicker-roll">
                      <AnimatePresence initial={false} mode="wait">
                        <motion.span
                          className="lc-kicker-value"
                          key={`${auction.id}-${auction.status}-${auction.bidCount}`}
                          initial={{ y: 8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -8, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                          {upcoming ? `Leilão #${auction.id}` : `${ended ? 'Leilão encerrado' : 'Lance atual'} #${NUMBER.format(auction.bidCount)}`}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    <div className="lc-leader lc-leader-roll">
                      <AnimatePresence initial={false} mode="wait">
                        <motion.span
                          className="lc-leader-value"
                          key={`${auction.id}-${auction.status}-${leaderText}`}
                          initial={{ y: '100%', opacity: 0, scale: 0.98 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: '-100%', opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                        >
                          {leaderText}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    <div className={`lc-subline${connectionNotice ? ` is-sync-notice is-${countdownConnectionState}` : ''}`} role={connectionNotice ? 'status' : undefined} aria-live={connectionNotice ? 'polite' : undefined}>
                      {serverConnectionLost && isVerifyingAuction ? 'Sem conexão — resultado ainda não confirmado'
                        : isVerifyingAuction ? 'O servidor ainda está confirmando o resultado'
                        : connectionNotice ?? (upcoming ? 'Começa quando o leilão anterior encerrar' : ended
                          ? mine ? `Você levou os ${BRL2.format(auction.prize)}` : `Levou os ${BRL2.format(auction.prize)}`
                          : mine ? 'Ao zerar, você leva o prêmio' : 'Ao zerar, quem deu o último lance leva o prêmio')}
                    </div>
                  </div>
                </section>
                <h2 className="lc-section-title">Todos os lances <span>{upcoming ? '' : NUMBER.format(auction.bidCount)}</span></h2>
                <ol
                  className="lc-bid-list"
                  aria-label="Lances do mais recente ao mais antigo"
                  ref={(element) => {
                    if (element) bidListRefs.current.set(auction.id, element);
                    else bidListRefs.current.delete(auction.id);
                  }}
                >
                  {upcoming
                    ? <li className="lc-bid-row is-footer">Os lances aparecem aqui quando o leilão começar</li>
                    : <>
                      {orderedBids.map((bid) => (
                        <BidRow
                          bid={bid}
                          isIncoming={incomingBid?.auctionId === auction.id && incomingBid.bidNumber === bid.number}
                          key={`${auction.id}-${bid.number}`}
                        />
                      ))}
                      {historyBusy && (
                        <li className="lc-bid-row is-footer">Carregando lances…</li>
                      )}
                      {(orderedBids.length >= auction.bidCount || !orderedBids.length) && (
                        <li className="lc-bid-row is-footer">Início do leilão</li>
                      )}
                      <li
                        className="lc-history-sentinel"
                        ref={(element) => {
                          if (element) historySentinelRefs.current.set(auction.id, element);
                          else historySentinelRefs.current.delete(auction.id);
                        }}
                        aria-hidden="true"
                      />
                    </>}
                </ol>
              </div>
            </section>
          );
        })}
      </div>

      <footer className="lc-footer">
        <p>
          {isVisibleCurrent
            ? isAwaitingVerification ? 'Aguardando confirmação do resultado pelo servidor…'
              : currentIsEnded ? 'Este leilão terminou' : currentAuction.usedBids ? `Você deu ${NUMBER.format(currentAuction.usedBids)} ${currentAuction.usedBids > 1 ? 'lances' : 'lance'} neste leilão` : 'Cada lance reinicia o tempo em 15 s'
            : visibleIndex === currentIndex + 1 && currentIsEnded ? 'Este leilão ainda não começou'
              : visibleIndex < currentIndex ? 'Este leilão terminou' : 'Este leilão ainda não começou'}
        </p>
        <button className="lc-cta" type="button" onClick={() => void placeBid()} disabled={buttonDisabled} data-testid="button-place-bid">
          {isAwaitingVerification ? 'Verificando resultado…'
            : bidMutation.isPending ? 'Enviando lance…'
            : isVisibleCurrent ? !isAuthenticated ? 'Entrar para participar' : currentIsEnded ? 'Próximo leilão' : !hasAccountData ? 'Carregando saldo…' : currentLeaderIsUser ? 'Você deu o último lance' : state.balance ? 'Dar lance' : 'Comprar lances'
              : visibleIndex === currentIndex + 1 && currentIsEnded ? 'Começar este leilão'
                : currentAuction.status === 'ended' ? 'Ir para o leilão mais recente' : 'Voltar ao leilão ao vivo'}
        </button>
      </footer>

      <p className="lc-visually-hidden" id="lc-live" aria-live="polite" />
      {toastText && <p className="lc-toast" role="status">{toastText}</p>}

      <dialog className="lc-dialog" ref={purchaseDialogRef} aria-labelledby="purchase-title" onClick={(event) => { if (event.target === purchaseDialogRef.current) purchaseDialogRef.current?.close(); }}>
        <div className="lc-dialog-content">
          <div className="lc-dialog-heading">
            <div><h2 id="purchase-title">Comprar lances</h2><p>{state.balance ? 'Cada lance que você dá usa 1 do seu saldo.' : 'Seu saldo acabou. Escolha um pacote para continuar.'}</p></div>
            <button className="lc-close" type="button" aria-label="Fechar" onClick={() => purchaseDialogRef.current?.close()} data-testid="button-close-purchase"><X size={16} strokeWidth={3} /></button>
          </div>
          <div className="lc-package-list">
            {packages.map((pack: LancePackage) => {
              const total = pack.bids + pack.bonus;
              const unit = pack.price / total;
              const discount = Math.round((1 - unit) * 100);
              return (
                <label className="lc-package" key={pack.id}>
                  <input type="radio" name="package" value={pack.id} checked={selectedPackage?.id === pack.id} onChange={() => setSelectedPackageId(pack.id)} data-testid={`input-package-${pack.id}`} />
                  <span className="lc-package-card">
                    <i className="lc-radio" />
                    <span className="lc-package-info">
                      <b>{NUMBER.format(total)} lances</b>
                      <small>{pack.bonus ? `${pack.bids} + ${pack.bonus} de bônus. ` : ''}{discount > 0 && <s>R$ 1,00</s>}{BRL2.format(unit)} por lance</small>
                    </span>
                    <span className="lc-package-price"><span>{BRL0.format(pack.price)}</span>{discount > 0 && <em>−{discount}%</em>}</span>
                  </span>
                  {pack.label && <em className="lc-package-label">{pack.label}</em>}
                </label>
              );
            })}
          </div>
          <button className="lc-cta lc-payment-button" type="button" disabled={!selectedPackage || packageMutation.isPending} onClick={() => void purchasePackage()} data-testid="button-simulated-pix">
            {packageMutation.isPending ? 'Confirmando Pix…' : selectedPackage ? `Pagar ${BRL0.format(selectedPackage.price)} com Pix` : 'Escolha um pacote'}
          </button>
          <p className="lc-note">Pix simulado neste protótipo. Lances usados não são reembolsados.</p>
        </div>
      </dialog>

      <dialog className="lc-dialog" ref={accountDialogRef} aria-labelledby="account-title" onClick={(event) => { if (event.target === accountDialogRef.current) accountDialogRef.current?.close(); }}>
        <div className="lc-dialog-content">
          <div className="lc-dialog-header-actions">
            <div className="lc-back-heading">
              {accountView !== 'main' && <button className="lc-close" type="button" aria-label="Voltar" onClick={() => { setAccountNotice(''); setAccountView('main'); }} data-testid="button-account-back"><ArrowLeft size={16} strokeWidth={3} /></button>}
              <h2 id="account-title">{accountView === 'main' ? 'Minha conta' : accountView === 'prizes' ? 'Meus prêmios' : 'Meus dados'}</h2>
            </div>
            <button className="lc-close" type="button" aria-label="Fechar" onClick={() => accountDialogRef.current?.close()} data-testid="button-close-account"><X size={16} strokeWidth={3} /></button>
          </div>

          {accountView === 'main' && state.user && (
            <section className="lc-account-main">
              {accountNotice && <p className="lc-status" role="status">{accountNotice}</p>}
              <button className="lc-account-user" type="button" onClick={openProfile} aria-label="Editar dados da conta" data-testid="button-edit-profile">
                <span className="lc-avatar big">{state.user.name.trim()[0]?.toUpperCase()}</span>
                <span className="lc-user-copy"><b>{state.user.name}</b><small>{state.user.email}</small></span>
                <span className="lc-edit">Editar</span>
              </button>
              <button className="lc-row-button" type="button" onClick={() => setAccountView('prizes')} data-testid="button-open-prizes">
                <span className="lc-icon-disc"><TrophyMark /></span>
                <span className="lc-user-copy"><b>Meus prêmios</b><small>{state.prizes.length ? `${state.prizes.length} ${state.prizes.length > 1 ? 'prêmios' : 'prêmio'}` : 'Nenhum prêmio ainda'}</small></span>
                <ChevronRight size={18} strokeWidth={3} />
              </button>
              <button className="lc-cta secondary" type="button" onClick={() => void signOut()} disabled={logoutMutation.isPending} data-testid="button-sign-out">{logoutMutation.isPending ? 'Saindo…' : 'Sair da conta'}</button>
            </section>
          )}

          {accountView === 'prizes' && (
            <ol className="lc-bid-list" aria-label="Prêmios conquistados">
              {state.prizes.length
                ? [...state.prizes].reverse().map((prize) => {
                  const dateLabel = new Date(prize.wonAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                  return (
                    <li className="lc-prize-row" key={prize.auctionId} data-testid={`row-prize-${prize.auctionId}`}>
                      <span className="lc-icon-disc"><TrophyMark size={20} /></span>
                      <span className="lc-user-copy"><b>Leilão #{prize.auctionId}</b><small>{dateLabel}</small></span>
                      <span className="lc-won-value">
                        <b>{BRL2.format(prize.prize)}</b>
                        {prize.redeemed
                          ? <small>Resgatado</small>
                          : <button className="lc-redeem" type="button" disabled={redeemingId === prize.auctionId || redeemMutation.isPending} onClick={() => void redeemPrize(prize)} data-testid={`button-redeem-${prize.auctionId}`}>
                            {redeemingId === prize.auctionId ? 'Resgatando…' : 'Resgatar'}
                          </button>}
                      </span>
                    </li>
                  );
                })
                : <li className="lc-bid-row is-footer">Você ainda não ganhou nenhum prêmio. Fique na frente quando o tempo zerar!</li>}
            </ol>
          )}

          {accountView === 'profile' && (
            <form className="lc-profile-form" noValidate onSubmit={(event) => void saveProfile(event)}>
              <div className="lc-field">
                <label htmlFor="profile-name">Nome</label>
                <input id="profile-name" autoComplete="name" value={profileName} aria-invalid={Boolean(profileErrors.name)} aria-describedby="profile-name-error" onChange={(event) => { setProfileName(event.target.value); setProfileErrors((old) => ({ ...old, name: '' })); }} data-testid="input-profile-name" />
                {profileErrors.name && <p id="profile-name-error" className="lc-field-error">{profileErrors.name}</p>}
              </div>
              <div className="lc-field">
                <label htmlFor="profile-email">E-mail</label>
                <input id="profile-email" type="email" autoComplete="email" inputMode="email" value={profileEmail} aria-invalid={Boolean(profileErrors.email)} aria-describedby="profile-email-error" onChange={(event) => { setProfileEmail(event.target.value); setProfileErrors((old) => ({ ...old, email: '' })); }} data-testid="input-profile-email" />
                {profileErrors.email && <p id="profile-email-error" className="lc-field-error">{profileErrors.email}</p>}
              </div>
              <h3 className="lc-form-title">Alterar senha</h3>
              <p className="lc-note" style={{ textAlign: 'left', marginTop: 4 }}>Deixe em branco para manter a senha atual.</p>
              {[
                { id: 'current', label: 'Senha atual', value: passwordCurrent, change: setPasswordCurrent, auto: 'current-password', error: profileErrors.current },
                { id: 'new', label: 'Nova senha', value: passwordNew, change: setPasswordNew, auto: 'new-password', error: profileErrors.new },
                { id: 'confirm', label: 'Confirmar nova senha', value: passwordConfirm, change: setPasswordConfirm, auto: 'new-password', error: profileErrors.confirm },
              ].map((field) => (
                <div className="lc-field" key={field.id}>
                  <label htmlFor={`profile-${field.id}`}>{field.label}</label>
                  <input id={`profile-${field.id}`} type={showPasswords ? 'text' : 'password'} autoComplete={field.auto} value={field.value} aria-invalid={Boolean(field.error)} aria-describedby={`profile-${field.id}-error`} onChange={(event) => { field.change(event.target.value); setProfileErrors((old) => ({ ...old, [field.id]: '' })); }} data-testid={`input-profile-${field.id}-password`} />
                  {field.error && <p id={`profile-${field.id}-error`} className="lc-field-error">{field.error}</p>}
                </div>
              ))}
              <label className="lc-show-password"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} data-testid="input-show-passwords" />Mostrar senhas</label>
              <button className="lc-cta lc-save" type="submit" disabled={savingProfile || profileMutation.isPending} data-testid="button-save-profile">{savingProfile ? 'Salvando…' : 'Salvar alterações'}</button>
            </form>
          )}
        </div>
      </dialog>

      <dialog
        className="lc-dialog lc-auth-dialog"
        ref={authDialogRef}
        aria-labelledby="auth-title"
        onClick={(event) => { if (event.target === authDialogRef.current) authDialogRef.current?.close(); }}
      >
        <div className="lc-dialog-content">
          <div className="lc-dialog-heading">
            <div>
              <h2 id="auth-title">{authMode === 'in' ? 'Entrar' : 'Criar conta'}</h2>
            </div>
            <button className="lc-close" type="button" aria-label="Fechar" onClick={() => authDialogRef.current?.close()} data-testid="button-close-auth"><X size={16} strokeWidth={3} /></button>
          </div>
          <p className="lc-auth-intro">Entre ou crie sua conta para dar lances e disputar os prêmios.</p>
          <form className="lc-auth-form" noValidate onSubmit={submitAuth}>
            {authMode === 'up' && (
              <div className="lc-field">
                <label htmlFor="auth-name">Nome</label>
                <input id="auth-name" autoComplete="name" placeholder="Seu nome" value={authName} aria-invalid={Boolean(authErrors.name)} aria-describedby="auth-name-error" onChange={(event) => { setAuthName(event.target.value); setAuthErrors((old) => ({ ...old, name: '' })); }} data-testid="input-auth-name" />
                {authErrors.name && <p id="auth-name-error" className="lc-field-error">{authErrors.name}</p>}
              </div>
            )}
            <div className="lc-field">
              <label htmlFor="auth-email">E-mail</label>
              <input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="nome@email.com" value={authEmail} aria-invalid={Boolean(authErrors.email)} aria-describedby="auth-email-error" onChange={(event) => { setAuthEmail(event.target.value); setAuthErrors((old) => ({ ...old, email: '' })); }} data-testid="input-auth-email" />
              {authErrors.email && <p id="auth-email-error" className="lc-field-error">{authErrors.email}</p>}
            </div>
            <div className="lc-field">
              <label htmlFor="auth-password">Senha</label>
              <div className="lc-auth-password">
                <input id="auth-password" type={authShowPassword ? 'text' : 'password'} autoComplete={authMode === 'up' ? 'new-password' : 'current-password'} placeholder={authMode === 'up' ? 'Crie uma senha' : 'Sua senha'} value={authPassword} aria-invalid={Boolean(authErrors.password)} aria-describedby="auth-password-error auth-password-hint" onChange={(event) => { setAuthPassword(event.target.value); setAuthErrors((old) => ({ ...old, password: '' })); }} data-testid="input-auth-password" />
                <button className="lc-auth-password-toggle" type="button" aria-label={authShowPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-controls="auth-password" onClick={() => setAuthShowPassword((visible) => !visible)} data-testid="button-toggle-auth-password">
                  {authShowPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {authErrors.password && <p id="auth-password-error" className="lc-field-error">{authErrors.password}</p>}
              {authMode === 'up' && <p id="auth-password-hint" className="lc-auth-hint">Use pelo menos 8 caracteres.</p>}
            </div>
            {authNotice && <p className="lc-auth-notice" role="status" data-testid="status-auth-notice">{authNotice}</p>}
            <button className="lc-cta lc-auth-submit" type="submit" disabled={loginMutation.isPending || registerMutation.isPending} data-testid="button-submit-auth">
              {loginMutation.isPending || registerMutation.isPending ? 'Aguarde…' : authMode === 'in' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
          <p className="lc-auth-switch">
            {authMode === 'in' ? 'Não tem conta? ' : 'Já tem conta? '}
            <button className="lc-auth-link" type="button" onClick={() => changeAuthMode(authMode === 'in' ? 'up' : 'in')} data-testid="button-switch-auth-mode">
              {authMode === 'in' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </dialog>
    </main>
  );
}

function Home() {
  return <LanceCash />;
}

function Router() {
  return (
    <ErrorBoundary resetKey={useLocation()[0]}>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}

export default App;
