import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import { logger } from "./logger";
import { isTrustedOrigin } from "./origin";

export type AuctionRealtimeUpdate = {
  type: "auction:update";
  currentAuctionId: number;
  auctionId: number;
  prize: number;
  status: "live" | "ended" | "upcoming";
  bidCount: number;
  leader: string;
  startedAt: string | null;
  deadlineAt: string | null;
  serverTime: string;
  bid: {
    number: number;
    leader: string;
    createdAt: string;
  } | null;
};

let activeWebSocketServer: WebSocketServer | null = null;

export function getActiveAuctionViewerCount(): number {
  const webSocketServer = activeWebSocketServer;
  if (!webSocketServer) return 0;

  let activeConnections = 0;
  for (const client of webSocketServer.clients) {
    if (client.readyState === WebSocket.OPEN) activeConnections += 1;
  }
  return activeConnections;
}

export function attachAuctionRealtime(server: Server): () => void {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  });
  const aliveClients = new WeakSet<WebSocket>();

  const heartbeat = setInterval(() => {
    for (const client of webSocketServer.clients) {
      if (!aliveClients.has(client)) {
        client.terminate();
        continue;
      }
      aliveClients.delete(client);
      client.ping();
    }
  }, 25_000);
  heartbeat.unref();

  webSocketServer.on("connection", (client) => {
    aliveClients.add(client);
    client.on("pong", () => aliveClients.add(client));
    client.on("message", () => {
      client.close(1008, "This channel is read-only.");
    });
    client.on("error", (error) => {
      logger.debug({ err: error }, "Auction WebSocket client error");
    });
  });

  const handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/ws" || !isTrustedOrigin(request)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    if (webSocketServer.clients.size >= 500) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit("connection", client, request);
    });
  };

  server.on("upgrade", handleUpgrade);
  activeWebSocketServer = webSocketServer;

  return () => {
    clearInterval(heartbeat);
    server.off("upgrade", handleUpgrade);
    for (const client of webSocketServer.clients) {
      client.close(1001, "Server shutting down.");
    }
    webSocketServer.close();
    if (activeWebSocketServer === webSocketServer) {
      activeWebSocketServer = null;
    }
  };
}

export function publishAuctionUpdate(event: AuctionRealtimeUpdate): void {
  const webSocketServer = activeWebSocketServer;
  if (!webSocketServer) return;

  const message = JSON.stringify(event);
  for (const client of webSocketServer.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(message, (error) => {
      if (error) {
        logger.debug({ err: error }, "Failed to send auction WebSocket update");
        client.terminate();
      }
    });
  }
}
