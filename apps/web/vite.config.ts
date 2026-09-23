import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Default: API dev :3001. E2E (Playwright) override qua env VITE_API_PROXY_TARGET
// chỉ vào API test :3101 (DB riêng, không đụng dev DB).
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET || "http://localhost:3001";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Chi Tiêu Gia Đình",
        short_name: "Chi Tiêu",
        description: "Quản lý chi tiêu cho gia đình — nhập nhanh, tối giản",
        lang: "vi",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F8FAFA",
        theme_color: "#0D9488",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell offline: mọi navigation rơi về index.html đã precache
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": API_PROXY_TARGET,
    },
  },
  // `vite preview` — build production (kèm SW/manifest) + proxy API để test PWA thật
  preview: {
    port: 4173,
    proxy: {
      "/api": API_PROXY_TARGET,
    },
  },
});
