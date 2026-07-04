import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const usesGithubPagesCustomDomain = process.env.GITHUB_PAGES_CUSTOM_DOMAIN === 'true'
const githubPagesBase = repositoryName && !repositoryName.endsWith('.github.io')
  ? `/${repositoryName}/`
  : '/'

// GitHub Pages project sites need a repo-prefixed base path unless a custom domain is active.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' && !usesGithubPagesCustomDomain
    ? githubPagesBase
    : '/',
  plugins: [vue(), tailwindcss()],
})
