/**
 * ボードの絞り込みの条件を、URLと結び付けて持つフック
 *
 * 条件はボードのURLのクエリ（?when=・?person= など。src/components/routes.ts）に持たせ、共有・再表示できるようにします。
 * ただし、証言・人物などの詳細ページのURLと、そこからの「ボードに戻る」のURLは、条件を持ちません
 * （詳細へのリンクは多くの画面で組み立てているため、すべてに条件を引き継がせるのをやめました）。
 * そこで、ボード（CaseBoard）が最後に使った条件を覚えておき、条件の無いボードのURLに戻ってきたときは、
 * 覚えている条件をURLへ戻します（router.replace）。表示を切り替えた（タブを移った）ときも同じです。
 *
 * 条件の持ち主はこのフックです。ボードを表示している間に、URLが条件を持っていれば、URLを正として覚え直します
 * （共有されたリンクを開いた場合や、ブラウザの「戻る」で別の条件のURLに戻った場合）。
 * 注意: 条件の無いボードのURLを開き直しても、覚えている条件が戻ります。条件を外すには「解除」を使います。
 * 注意: CaseBoard はケースのレイアウトに置くため、ページを移っても作り直されません。覚えている条件はケースごとに分け、
 * 別のケースへ移ったときに持ち越さないようにします。
 */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardFilter } from '@/domain/board-filter';
import type { Id } from '@/domain/types';
import { boardFilterQuery, boardHref, hasBoardFilterParams, parseBoardFilter, type TabKey } from './routes';

/** 覚えている条件です。どのケースの条件かと、条件のクエリの文字列（boardFilterQuery）の組で持ちます。 */
type RememberedFilter = { caseId: Id; query: string };

/**
 * ボードの絞り込みの条件と、条件を変える関数を返します。
 *
 * @param caseId いま開いているケースのIDです。
 * @param tab いま開いている表示（タブ）です。条件を変えたときのURLに使います。
 * @param isBoardShown ボードを表示しているかどうかです。詳細を開いている間は false を渡します。
 *   詳細のURLは条件を持たないため、その間はURLを正とせず、覚えている条件を使います。
 */
export function useBoardFilter(caseId: Id, tab: TabKey, isBoardShown: boolean): [BoardFilter, (next: BoardFilter) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlHasFilter = hasBoardFilterParams(searchParams);
  const urlQuery = boardFilterQuery(parseBoardFilter(searchParams));
  const [remembered, setRemembered] = useState<RememberedFilter>({ caseId, query: urlQuery });
  const rememberedQuery = remembered.caseId === caseId ? remembered.query : '';

  // ボードのURLが条件を持っていれば、URLを正として覚え直す。描画の途中で覚え直し、古い条件で1度描画するのを避ける
  if (isBoardShown && urlHasFilter && urlQuery !== rememberedQuery) {
    setRemembered({ caseId, query: urlQuery });
  }
  const activeQuery = isBoardShown && urlHasFilter ? urlQuery : rememberedQuery;

  // 条件の無いボードのURLに戻ってきたときは、覚えている条件をURLへ戻す。共有や再表示に使えるURLを保つため
  useEffect(() => {
    if (!isBoardShown || urlHasFilter || rememberedQuery === '') return;
    router.replace(boardHref(caseId, tab, parseBoardFilter(new URLSearchParams(rememberedQuery))));
  }, [caseId, isBoardShown, rememberedQuery, router, tab, urlHasFilter]);

  const filter = useMemo(() => parseBoardFilter(new URLSearchParams(activeQuery)), [activeQuery]);
  const setFilter = useCallback(
    (next: BoardFilter) => {
      setRemembered({ caseId, query: boardFilterQuery(next) });
      router.replace(boardHref(caseId, tab, next));
    },
    [caseId, router, tab]
  );
  return [filter, setFilter];
}
