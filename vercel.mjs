const railwayApiUrl = process.env.RAILWAY_API_URL;
if (!railwayApiUrl) {
  throw new Error(
    "Set RAILWAY_API_URL in Vercel to the Railway service's public HTTPS origin.",
  );
}

const railwayApi = new URL(railwayApiUrl);
if (railwayApi.protocol !== "https:" || railwayApi.pathname !== "/") {
  throw new Error(
    "RAILWAY_API_URL must be an HTTPS origin without a path, for example https://api.example.com.",
  );
}

const auctionWebSocketUrl = process.env.VITE_AUCTION_WS_URL;
if (!auctionWebSocketUrl) {
  throw new Error(
    "Set VITE_AUCTION_WS_URL in Vercel to the Railway WebSocket endpoint.",
  );
}

const auctionWebSocket = new URL(auctionWebSocketUrl);
if (
  auctionWebSocket.protocol !== "wss:" ||
  auctionWebSocket.pathname !== "/ws"
) {
  throw new Error(
    "VITE_AUCTION_WS_URL must be a secure WebSocket URL ending in /ws.",
  );
}

export const config = {
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm --filter @workspace/lance-cash run build",
  outputDirectory: "artifacts/lance-cash/dist/public",
  framework: "vite",
  rewrites: [
    {
      source: "/api/:path*",
      destination: `${railwayApi.origin}/api/:path*`,
    },
    {
      source: "/(.*)",
      destination: "/index.html",
    },
  ],
};
