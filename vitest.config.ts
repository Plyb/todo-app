import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Parallel worktree agents live under .claude/worktrees/, nested inside
    // this same checkout - without excluding it, a plain `vitest run` here
    // also discovers and runs every one of their test files (each against
    // this repo's own dependencies/config, not their own), producing a
    // flood of unrelated failures that look like a regression in this repo.
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
})
