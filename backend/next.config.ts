import type { NextConfig } from 'next';

// Sem output: 'standalone' — o custom server (server.ts) precisa do
// http.Server pra pendurar o upgrade do WebSocket (Socket.IO), e o modo
// standalone não traça um server customizado (ver server.ts para o motivo
// completo). Trade-off aceito: build/imagem Docker maior, sem tracing podado
// de node_modules.
const nextConfig: NextConfig = {};

export default nextConfig;
