export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: false },
  ssr: true,
  app: {
    head: {
      title: 'hicode — painel',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0d1117' },
      ],
    },
  },
})
