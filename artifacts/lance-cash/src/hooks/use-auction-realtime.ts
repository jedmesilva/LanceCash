import { useEffect, useRef, useState } from "react";
import type { AuctionBid, LanceCashAuction } from "@workspace/api-client-react";

export type AuctionRealtimeUpdate = {
  type: "auction:update";
  currentAuctionId: number;
  auctionId: number;
  prize: number;
  status: LanceCashAuction["status"];
  bidCount: number;
  leader: string;
  startedAt: string | null;
  deadlineAt: string | null;
  serverTime: string;
  bid: AuctionBid | null;
};

function isAuctionRealtimeUpdate(value: unknown): value is AuctionRealtimeUpdate {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (
    event.type !== "auction:update" ||
    !Number.isInteger(event.currentAuctionId) ||
    !Number.isInteger(event.auctionId) ||
    !Number.isInteger(event.prize) ||
    !Number.isInteger(event.bidCount) ||
    typeof event.leader !== "string" ||
    typeof event.serverTime !== "string" ||
    !["live", "ended", "upcoming"].includes(String(event.status)) ||
    !(event.startedAt === null || typeof event.startedAt === "string") ||
    !(event.deadlineAt === null || typeof event.deadlineAt === "string")
  ) {
    return false;
  }

  if (event.bid === null) return true;
  if (!event.bid || typeof event.bid !== "object") return false;
  const bid = event.bid as Record<string, unknown>;
  return (
    Number.isInteger(bid.number) &&
    typeof bid.leader === "string" &&
    typeof bid.createdAt === "string"
  );
}

export function useAuctionRealtime(onUpdate: (event: AuctionRealtimeUpdate) => void): boolean {
  const [connected, setConnected] = useState(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    const connect = () => {
      if (!active) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const nextSocket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket = nextSocket;

      nextSocket.addEventListener("open", () => {
        if (!active) return;
        reconnectAttempt = 0;
        setConnected(true);
      });

      nextSocket.addEventListener("message", (message) => {
        if (typeof message.data !== "string" || message.data.length > 16_384) return;
        try {
          const parsed: unknown = JSON.parse(message.data);
          if (isAuctionRealtimeUpdate(parsed)) onUpdateRef.current(parsed);
        } catch {
          // Ignore malformed messages and keep the connection available for valid updates.
        }
      });

      nextSocket.addEventListener("close", () => {
        setConnected(false);
        if (!active) return;
        const delay = Math.min(500 * 2 ** reconnectAttempt, 15_000);
        reconnectAttempt = Math.min(reconnectAttempt + 1, 6);
        reconnectTimer = window.setTimeout(connect, delay);
      });

      nextSocket.addEventListener("error", () => {
        if (nextSocket.readyState !== WebSocket.CLOSED) nextSocket.close();
      });
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close(1000, "Page closed.");
    };
  }, []);

  return connected;
}
