/**
 * テストでケースを開くための補助
 *
 * 画面のテストは「ケースが1件保存されていて、それを開いている」状態から始めることが多いため、
 * 保存（saveCase）と、ストアで開く操作（openCase）をまとめます。どちらも IndexedDB を読み書きするため、非同期です。
 */
import { saveCase } from '@/lib/case-storage';
import { useCaseStore } from '@/stores/useCaseStore';
import type { Case } from '@/domain/types';

/** ケースを保存し、ストアで開きます。 */
export async function openTestCase(target: Case): Promise<void> {
  await saveCase(target);
  await useCaseStore.getState().openCase(target.id);
}

/** 開いているケースを返します。開いていない場合は、テストを失敗させるために例外を投げます。 */
export function openedCase(): Case {
  const { currentCase } = useCaseStore.getState();
  if (currentCase === null) throw new Error('ケースが開かれていません');
  return currentCase;
}
