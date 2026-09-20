import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * RABBIT ROYALE — le front web.
 *
 * POURQUOI VITE ET PLUS NEXT. Il ne restait a Next que trois choses : servir
 * des fichiers statiques, proxifier /api vers le serveur socket, et porter les
 * balises PWA. Aucune route ne s'executait plus ici (elles vivent dans
 * server/api-router.ts depuis 8897d7b), aucun Server Component non plus : la
 * page du jeu est `'use client'` de sa premiere ligne. Storybook tournait deja
 * sur Vite — le repo avait donc DEUX chaines de build pour le meme code, qui
 * pouvaient diverger. Il n'en reste qu'une.
 *
 * Les ateliers /island et /isoworld ne sont PAS construits : ce sont des
 * outils de dev, rien dans le jeu n'y mene, et une image de production n'a
 * pas a les porter. Ils restent servis par `bun run dev`, qui sert n'importe
 * quel index.html du projet — leur code et leurs entrees sont intacts.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    // Les memes alias que tsconfig.json et .storybook/main.ts — 203 fichiers
    // importent par `@/`.
    alias: {
      '@': join(here, 'src'),
      '@config': join(here, 'config'),
    },
  },

  /**
   * `process.env` n'existe pas dans un bundle navigateur.
   *
   * Next l'inlinait a la compilation ; des modules de config le LISENT a
   * l'import et jettent sans lui (c'est exactement le contournement qu'a
   * .storybook/preview.ts). On le remplace donc par un objet vide : chaque
   * lecture retombe sur sa valeur par defaut. L'URL du socket ne passe pas
   * par la — elle vient de /api/config, au RUNTIME, donc un changement d'URL
   * ne demande aucun rebuild.
   */
  define: {
    'process.env': '{}',
  },

  server: {
    port: 3010,
    /**
     * En dev, /api part vers le serveur socket local (bun run ws).
     * En production c'est le reverse proxy qui s'en charge : le bundle
     * n'embarque aucune URL d'API, il appelle /api en relatif comme avant.
     */
    proxy: {
      '/api': {
        target: process.env.API_SERVER_URL ?? 'http://localhost:3011',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    // Le jeu, et lui seul. Voir l'entete : les ateliers restent en dev.
    rollupOptions: {
      input: { main: join(here, 'index.html') },
    },
  },
});
