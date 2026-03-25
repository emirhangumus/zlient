import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: 'Zlient',
    description: 'Type-safe HTTP client with Zod validation',
    base: '/zlient/',
    themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'API Reference', link: '/api/' }
        ],

        sidebar: [
            {
                text: 'Introduction',
                items: [
                    { text: 'Getting Started', link: '/guide/getting-started' },
                    { text: 'Why Zlient?', link: '/guide/why-zlient' }
                ]
            },
            {
                text: 'Core Concepts',
                items: [
                    { text: 'Functional Endpoints', link: '/guide/functional-api' },
                    { text: 'Authentication', link: '/guide/authentication' },
                    { text: 'Configuration', link: '/guide/configuration' },
                    { text: 'Interceptors', link: '/guide/interceptors' },
                    { text: 'Error Handling', link: '/guide/error-handling' },
                    { text: 'Types & Schemas', link: '/guide/types-and-schemas' },
                    { text: 'Real-Time (WS & SSE)', link: '/guide/real-time' },
                    { text: 'Observability', link: '/guide/observability' }
                ]
            }
        ],

        socialLinks: [
            { icon: 'github', link: 'https://github.com/emirhangumus/zlient' }
        ],

        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Copyright © 2024-present Emirhan Gumus'
        }
    }
});
