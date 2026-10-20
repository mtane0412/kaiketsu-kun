/**
 * ボードの絞り込みの条件を、URLと結び付けて持つフック
 *
 * 条件はボードのURLのクエリ（?when=・?person= など。src/components/routes.ts）に持たせ、共有・再表示できるようにします。
 * ただし、証言・人物などの詳細ページのURLと、そこからの「ボードに戻る」のURLは、条件を持ちません
 * （詳細へのリンクは多くの画面で組み立てているため、すべてに条件を引き継がせるのをやめました）。
 * そこで、ボード（CaseBoard）が最後に使った条件を覚えておき、条件の無いボードのURLに戻ってきたときは、
 * 覚えている条件をURLへ戻します（router.replace）。表示を切り替えた（タブを移った）ときも同じです。
 *
 * 条件の持ち主はこのフックです。URLの条件は、ボードを表示している間に URL の条件が変わったときだけ読み直します
 * （共有されたリンクを開いた場合や、ブラウザの「戻る」で別の条件のURLに戻った場合）。
 * 変わったときだけに限るのは、条件を変えた直後の描画では、URLの書き換え（router.replace）がまだ反映されておらず、
 * 古いURLの条件で、変えたばかりの条件を上書きしてしまうためです（「解除」しても条件が戻ってしまいます）。
 * 条件として使えないクエリ（関わり方だけ、日時として読めない値など）は、条件が無いものとして扱います。
 *
 * 注意: 条件の無いボードのURLを開き直しても、覚えている条件が戻ります。条件を外すには「解除」を使います。
 * 注意: CaseBoard はケースのレイアウトに置くため、ページを移っても作り直されないことがあります。
 * 別のケースへ移ったときは、覚えている条件を捨て、元のケースへ戻ったときに条件が復活しないようにします。
 */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardFilter } from '@/domain/board-filter';
import type { Id } from '@/domain/types';
import { boardFilterQuery, boardHref, parseBoardFilter, type TabKey } from './routes';

/**
 * フックが覚えている状態です。
 * - caseId: どのケースの状態か
 * - query: 覚えている条件（条件のクエリの文字列。boardFilterQuery）
 * - seenUrlQuery: 最後に読んだ、ボードのURLの条件。URLの条件が変わったかどうかを見分けるために持ちます
 */
type BoardFilterMemory = { caseId: Id; query: string; seenUrlQuery: string };

/**
 * ボードの絞り込みの条件と、条件を変える関数を返します。
 *
 * @param caseId いま開いているケースのIDです。
 * @param tab いま開いている表示（タブ）です。条件を変えたときのURLに使います。
 * @param isBoardShown ボードを表示しているかどうかです。詳細を開いている間は false を渡します。
 *   詳細のURLは条件を持たないため、その間はURLを読まず、覚えている条件を使います。
 */
export function useBoardFilter(caseId: Id, tab: TabKey, isBoardShown: boolean): [BoardFilter, (next: BoardFilter) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = boardFilterQuery(parseBoardFilter(searchParams));
  const [memory, setMemory] = useState<BoardFilterMemory>({ caseId, query: urlQuery, seenUrlQuery: urlQuery });

  // 描画の途中で覚え直し、古い条件で1度描画するのを避ける
  if (memory.caseId !== caseId) {
    // 別のケースへ移った。前のケースの条件は捨て、このケースのURLの条件から始める
    setMemory({ caseId, query: urlQuery, seenUrlQuery: urlQuery });
  } else if (isBoardShown && urlQuery !== memory.seenUrlQuery) {
    // ボードのURLの条件が変わった。条件を持つURLなら、それを正として覚え直す。
    // 条件の無いURL（詳細からの「ボードに戻る」など）では覚えている条件を保ち、下の effect でURLへ戻す
    setMemory({ caseId, query: urlQuery === '' ? memory.query : urlQuery, seenUrlQuery: urlQuery });
  }
  const query = memory.caseId === caseId ? memory.query : urlQuery;

  // 条件の無いボードのURLに戻ってきたときは、覚えている条件をURLへ戻す。共有や再表示に使えるURLを保つため
  useEffect(() => {
    if (!isBoardShown || urlQuery !== '' || query === '') return;
    router.replace(boardHref(caseId, tab, parseBoardFilter(new URLSearchParams(query))));
  }, [caseId, isBoardShown, query, router, tab, urlQuery]);

  const filter = useMemo(() => parseBoardFilter(new URLSearchParams(query)), [query]);
  const setFilter = useCallback(
    (next: BoardFilter) => {
      setMemory((current) => ({ ...current, caseId, query: boardFilterQuery(next) }));
      router.replace(boardHref(caseId, tab, next));
    },
    [caseId, router, tab]
  );
  return [filter, setFilter];
}
