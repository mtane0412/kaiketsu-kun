import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * 経過時間の上限を確かめる性能テストのファイルです。
 * ほかのテストファイルと並列に動くと CPU を取り合って経過時間が延び、上限を超えることがあるため、別のプロジェクトに分けて単独で動かします。
 */
const PERFORMANCE_TEST_FILES = ['src/**/*-performance.test.ts'];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, ...PERFORMANCE_TEST_FILES],
        },
      },
      {
        extends: true,
        test: {
          name: 'performance',
          include: PERFORMANCE_TEST_FILES,
          // 注意: groupOrder が大きいプロジェクトは、小さいプロジェクトのテストがすべて終わってから動く
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
