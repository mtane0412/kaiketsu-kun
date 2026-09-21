/**
 * テストで案件を開くための補助
 *
 * 画面のテストは「案件が1件保存されていて、それを開いている」状態から始めることが多いため、
 * 保存（saveCase）と、ストアで開く操作（openCase）をまとめます。
 */
import { saveCase } from '@/lib/case-storage';
import { useCaseStore } from '@/stores/useCaseStore';
import type { Case } from '@/domain/types';

/** 案件を保存し、ストアで開きます。 */
export function openTestCase(target: Case): void {
  saveCase(target);
  useCaseStore.getState().openCase(target.id);
}

/** 開いている案件を返します。開いていない場合は、テストを失敗させるために例外を投げます。 */
export function openedCase(): Case {
  const { currentCase } = useCaseStore.getState();
  if (currentCase === null) throw new Error('案件が開かれていません');
  return currentCase;
}
