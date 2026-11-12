import type { AuctionBid } from '@workspace/api-client-react';
import { motion } from 'framer-motion';

const number = new Intl.NumberFormat('pt-BR');
const colors = [
  'var(--lc-bid-swatch-1)',
  'var(--lc-bid-swatch-2)',
  'var(--lc-bid-swatch-3)',
  'var(--lc-bid-swatch-4)',
  'var(--lc-bid-swatch-5)',
];

export function BidRow({ bid, fresh = false }: { bid: AuctionBid; fresh?: boolean }) {
  const isMine = bid.leader === 'Você';
  const colorIndex = [...bid.leader].reduce(
    (total, letter) => total + letter.charCodeAt(0),
    0,
  ) % colors.length;

  return (
    <motion.li
      className={`lc-bid-row${isMine ? ' is-mine' : ''}${fresh ? ' is-new' : ''}`}
      data-testid={`row-bid-${bid.number}`}
      layout="position"
      initial={false}
      animate={fresh ? { opacity: [0, 1], y: [-14, 0] } : { opacity: 1, y: 0 }}
      transition={{
        layout: { duration: 0.28, ease: 'easeOut' },
        opacity: { duration: 0.24, ease: 'easeOut' },
        y: { duration: 0.28, ease: 'easeOut' },
      }}
    >
      <i
        className="lc-bid-initial"
        style={{ background: isMine ? 'var(--lc-lime)' : colors[colorIndex] }}
        aria-hidden="true"
      >
        {bid.leader[0]?.toUpperCase()}
      </i>
      <div className="lc-bid-meta">
        <b>{bid.leader}</b>
        <small>Lance #{number.format(bid.number)}</small>
      </div>
      <time className="lc-bid-time" dateTime={bid.createdAt}>
        {new Date(bid.createdAt).toLocaleTimeString('pt-BR')}
      </time>
    </motion.li>
  );
}
