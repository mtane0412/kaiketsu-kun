/**
 * 開いている案件のIDを、URLから読み取るフック
 *
 * どの案件を開いているかはURL（/cases/<案件のID>）が決めるため、案件のボードと詳細に属するコンポーネントは、
 * このフックでIDを受け取り、リンク先のURLの組み立て（src/components/routes.ts）に使います。
 *
 * 注意: 案件のIDを持たないURL（案件の一覧ページなど）で呼び出すことは誤りのため、例外を投げます。
 */
'use client';

import { useParams } from 'next/navigation';
import type { Id } from '@/domain/types';

export function useCaseId(): Id {
  const { caseId } = useParams<{ caseId?: string }>();
  if (caseId === undefined) throw new Error('案件のIDを持たないURLで、案件のIDを読み取ろうとしました');
  // ルートのパラメータはURLから取り出した値のため、URLの記法を解いてからIDとして扱う
  return decodeURIComponent(caseId);
}
