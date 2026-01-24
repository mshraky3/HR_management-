import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/", // Ensure base path is correct for Vercel
  server: {
    port: 5173,
    strictPort: false,
    hmr: {
      overlay: true,
    },
    headers: {
      "Cache-Control": "no-store",
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "recharts"],
    exclude: [],
    esbuildOptions: {
      target: "es2020",
    },
  },
  cacheDir: "node_modules/.vite",
  build: {
    // Optimize chunk splitting for better code splitting
    rollupOptions: {
      // Enable tree shaking for better optimization
      // Only disable if absolutely necessary for specific dependencies
      output: {
        // Manual chunks for better caching and code splitting
        manualChunks: (id) => {
          // Separate vendor chunks for better caching
          if (id.includes("node_modules")) {
            // Keep React in a single chunk to avoid duplication
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-vendor";
            }
            if (id.includes("react-router")) {
              return "react-router-vendor";
            }
            if (id.includes("axios")) {
              return "axios-vendor";
            }
            if (id.includes("recharts")) {
              return "charts-vendor";
            }
            // Other vendor libraries
            return "vendor";
          }
          // Return undefined for app code (let Vite handle it)
          return undefined;
        },
        // Optimize chunk file names for better caching
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    // Increase chunk size warning limit (we're using code splitting, so chunks will be smaller)
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional, can disable for smaller builds)
    sourcemap: false,
    // CSS code splitting - split CSS per page but keep critical CSS in main bundle
    cssCodeSplit: true,
    // Ensure CSS is loaded synchronously
    cssMinify: true,
    // Disable CSS code splitting temporarily to ensure CSS loads
    // cssCodeSplit: false, // Uncomment if CSS isn't loading
    // Keep console logs for debugging (remove in production later)
    esbuild: {
      // drop: ['console', 'debugger'], // Temporarily disabled for debugging
      legalComments: "none", // Remove comments for smaller bundle
      minifyIdentifiers: false, // Prevent minification issues with closures
    },
    // Target modern browsers for better optimization
    target: "es2020",
    // Ensure proper module format for browser compatibility
    modulePreload: {
      polyfill: true
    },
  },
  // Optimize CSS loading
  css: {
    devSourcemap: false,
    // Ensure CSS is processed and loaded efficiently
    postcss: undefined, // Use default PostCSS config
  },
  // Resolve configuration to prevent duplicate React
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
});
