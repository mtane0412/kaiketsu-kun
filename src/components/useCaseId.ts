/**
 * 開いているケースのIDを、URLから読み取るフック
 *
 * どのケースを開いているかはURL（/cases/<ケースのID>）が決めるため、ケースのボードと詳細に属するコンポーネントは、
 * このフックでIDを受け取り、リンク先のURLの組み立て（src/components/routes.ts）に使います。
 *
 * 注意: ケースのIDを持たないURL（ケースの一覧ページなど）で呼び出すことは誤りのため、例外を投げます。
 */
'use client';

import { useParams } from 'next/navigation';
import type { Id } from '@/domain/types';

export function useCaseId(): Id {
  const { caseId } = useParams<{ caseId?: string }>();
  if (caseId === undefined) throw new Error('ケースのIDを持たないURLで、ケースのIDを読み取ろうとしました');
  // ルートのパラメータはURLから取り出した値のため、URLの記法を解いてからIDとして扱う
  return decodeURIComponent(caseId);
}
