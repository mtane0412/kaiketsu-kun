/**
 * ボード全体
 *
 * 画面を「左のサイドバー（CaseSidebar）」と「メインの1カラム」の2つに分けます。
 * サイドバーは、ケースの切り替え・表示の切り替え（時系列・グラフ・証言者別・人物の動き・地図・仮説・論点・未了事項）・登録済みの一覧（人物・場所・証言）を担います。
 * メインのカラムは、ボード（いま開いている表示）か、証言・人物・場所・仮説・論点・未了事項の詳細のどちらか一方だけを表示します。
 * 以前はボードの上にタブを並べ、「登録済みの一覧」をボードを覆うオーバーレイで開いていましたが、
 * どちらもナビゲーションのため、サイドバーに集約しました。
 *
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * 証言・人物・場所の編集は、それぞれの詳細（ClaimDetail・EntityDetail）で行います。詳細のルート
 * （/claims/<証言のID>・/persons/<人物のID>・/places/<場所のID>）と、人物・場所を新しく登録するルート
 * （/persons/new・/places/new）と、仮説の詳細・登録のルート（/hypotheses/<仮説のID>・/hypotheses/new）と、
 * 未了事項の詳細・登録のルート（/tasks/<未了事項のID>・/tasks/new）と、論点の詳細・登録のルート（/disputes/<論点のID>・/disputes/new）では、
 * 詳細（children）をボードと入れ替えて表示します。ボード全体の検索結果のルート（/search）も、同じく詳細として入れ替えます。
 * 以前はボードの横へ並べる2ペインでしたが、サイドバーを導入したあとは、サイドバーを押したときに
 * ボードと詳細のどちらが入れ替わったのかが分かりづらかったため、メインのカラムを1つに戻しました。
 *
 * 詳細を開いている間、ボードはHTMLの hidden で隠すだけにして、要素は残します。書き足しの入力中の内容を保つためです。
 * hidden で隠すとページのスクロール位置が失われるため、詳細から戻ったときの位置は useBoardScrollRestoration が復元します。
 *
 * 注意: このコンポーネントはレイアウト（src/app/cases/[caseId]/layout.tsx）に置きます。レイアウトはページを移っても
 * 再マウントされないため、証言を開閉しても、入力中の内容を保ちます。
 * 保存済みのケースの復元は CaseGate が担います。このコンポーネントは CaseGate の中に置いてください。
 * 人物の動きのビューは人物の数だけ列が増えるため、そのタブのときだけボードの幅の上限を外します。
 * 論点の詳細は、束ねた証言を6列の表で見比べるため、他の詳細より幅の上限を広げます。
 * useSearchParams・usePathname を使うため、ページでは Suspense の中に置いてください。
 *
 * 証言を並べる表示（時系列・グラフ・証言者別・人物の動き・地図）の上には、絞り込みの欄（BoardFilterPanel）を置き、
 * 日時の範囲・人物・資料・論点で、表示する証言を絞り込めるようにします（src/domain/board-filter.ts）。
 * 条件はURLに持たせ、表示を切り替えても、詳細を開いてから戻っても保ちます（useBoardFilter）。
 * 時系列には絞り込む前のケースを渡し、表示する証言のIDだけを伝えます。書き足す位置や動かした先を、絞り込む前の並びで数えるためです。
 * それ以外の表示には、証言を減らしたケースを渡します。グラフでは、残った証言に関わらない人物も描きません。
 *
 * キーボードだけで操作できるよう、ページの先頭に「本文へ移動」のリンク（サイドバーを飛ばしてメインの領域へ移るリンク）を置き、
 * Esc で詳細を閉じる・「/」と ⌘K で検索窓へ移るショートカットを受け付けます（useBoardShortcuts）。
 */
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { applyBoardFilter, isBoardFilterActive, resolveBoardFilter } from '@/domain/board-filter';
import { useCurrentCase } from '@/stores/useCaseStore';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { BOARD_SEARCH_INPUT_ID, CaseSidebar } from './CaseSidebar';
import { useBoardFilter } from './useBoardFilter';
import { useBoardScrollRestoration } from './useBoardScrollRestoration';
import { useBoardShortcuts } from './useBoardShortcuts';
import { useCaseId } from './useCaseId';
import { boardHref, parseDetailKind, parseTab, TAB_SEARCH_PARAM, TABS, type DetailKind, type TabKey } from './routes';
import { DisputeListView } from './views/DisputeListView';
import { BoardFilterPanel } from './views/BoardFilterPanel';
import { GraphView } from './views/GraphView';
import { HypothesisListView } from './views/HypothesisListView';
import { MapView } from './views/MapView';
import { PersonLaneView } from './views/PersonLaneView';
import { SpeakerView } from './views/SpeakerView';
import { TaskListView } from './views/TaskListView';
import { TimelineView } from './views/TimelineView';

/** 詳細を表示している間、枠と見出しに付ける名前です。読み上げで、何を開いているかが分かるようにします。 */
const DETAIL_LABELS: Record<DetailKind, string> = {
  claim: '証言の詳細',
  person: '人物の詳細',
  place: '場所の詳細',
  hypothesis: '仮説の詳細',
  task: '未了事項の詳細',
  interview: '資料の詳細',
  dispute: '論点の詳細',
  search: '検索結果',
  newPerson: '人物の登録',
  newPlace: '場所の登録',
  newHypothesis: '仮説の登録',
  newTask: '未了事項の登録',
  newInterview: '資料の登録',
  newDispute: '論点の登録',
};

/** 絞り込みの欄を置く表示です。証言を並べる表示だけで絞り込みます。 */
const FILTERABLE_TABS: ReadonlySet<TabKey> = new Set<TabKey>(['timeline', 'graph', 'speaker', 'lanes', 'map']);

/** 「本文へ移動」のリンクの移り先となる、メインの領域のIDです。 */
const BOARD_MAIN_ID = 'board-main';

/** ボード全体の検索窓へフォーカスを移します。検索窓が描画されていない場合は何もしません。 */
function focusSearchInput() {
  document.getElementById(BOARD_SEARCH_INPUT_ID)?.focus();
}

/**
 * ボードのキーボードショートカットを受け付けます（useBoardShortcuts）。
 * 検索窓はサイドバーの中にあるため、サイドバーを閉じているときは開いてからフォーカスを移します。
 * 画面の狭い端末のサイドバー（シート）は、閉じている間は検索窓を描画しません。そのため、フォーカスの要求を覚えておき、
 * シートが開いた（openMobile が true になった）あとに移ります。
 * サイドバーの開閉の状態（useSidebar）を使うため、SidebarProvider の中に置いてください。
 */
function BoardShortcuts({ isDetailOpen, tab }: { isDetailOpen: boolean; tab: TabKey }) {
  const caseId = useCaseId();
  const router = useRouter();
  const { isMobile, openMobile, setOpen, setOpenMobile } = useSidebar();
  /** シートが開くのを待っている、検索窓へのフォーカスの要求があるかどうかです。 */
  const isFocusPendingRef = useRef(false);

  useEffect(() => {
    if (!openMobile || !isFocusPendingRef.current) return;
    isFocusPendingRef.current = false;
    // シートは開いたときに中の要素へフォーカスを移すため、それが済んだ次の描画で検索窓へ移る
    const frame = requestAnimationFrame(focusSearchInput);
    return () => cancelAnimationFrame(frame);
  }, [openMobile]);

  const focusSearch = useCallback(() => {
    if (isMobile && !openMobile) {
      isFocusPendingRef.current = true;
      setOpenMobile(true);
      return;
    }
    if (!isMobile) setOpen(true);
    // 広い画面のサイドバーは閉じていても描画されているが、開く途中で隠れていることがあるため、次の描画でも移り直す
    focusSearchInput();
    requestAnimationFrame(focusSearchInput);
  }, [isMobile, openMobile, setOpen, setOpenMobile]);

  useBoardShortcuts({
    closeHref: isDetailOpen ? boardHref(caseId, tab) : undefined,
    onClose: router.push,
    onFocusSearch: focusSearch,
  });
  return null;
}

type CaseBoardProps = {
  /** ボードと入れ替えて表示する、証言・人物・場所の詳細（または登録フォーム）です。該当するルートでだけ表示します。 */
  children?: ReactNode;
};

export function CaseBoard({ children }: CaseBoardProps) {
  const currentCase = useCurrentCase();
  const pathname = usePathname();
  const activeTab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));

  const detailKind = parseDetailKind(pathname);
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)!.label;
  const boardRef = useRef<HTMLDivElement>(null);
  useBoardScrollRestoration(boardRef, detailKind === undefined, activeTab);

  const [rawFilter, setFilter] = useBoardFilter(currentCase.id, activeTab, detailKind === undefined);
  const filter = useMemo(() => resolveBoardFilter(currentCase, rawFilter), [currentCase, rawFilter]);
  const filterResult = useMemo(() => applyBoardFilter(currentCase, filter), [currentCase, filter]);
  const isFiltered = isBoardFilterActive(filter);
  const filteredCase = filterResult.target;

  return (
    <SidebarProvider>
      <a
        href={`#${BOARD_MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        本文へ移動
      </a>
      <BoardShortcuts isDetailOpen={detailKind !== undefined} tab={activeTab} />
      <CaseSidebar />

      {/* 人物の動きの表のように幅の広い中身があっても、サイドバーの幅ぶん画面の外へはみ出さないよう、縮められるようにする */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <h1 className="min-w-0 truncate text-sm font-semibold">{currentCase.name}</h1>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            /
          </span>
          {/* いまメインのカラムに出ているものを見出しにする。詳細を開いている間、ボードは見えていない。
              ケースの名前が長くても折り返さないよう、こちらは縮めない */}
          <h2 className="shrink-0 text-sm whitespace-nowrap text-muted-foreground">
            {detailKind ? DETAIL_LABELS[detailKind] : activeTabLabel}
          </h2>
        </header>

        {/* 「本文へ移動」のリンクでフォーカスを受け取れるよう、tabIndex を -1 にする */}
        <div id={BOARD_MAIN_ID} tabIndex={-1} className="flex-1 p-4 outline-none">
          {/* 詳細を開いても再マウントされないよう、ボードは常に同じ位置の要素に描画し、隠すだけにする */}
          <div
            ref={boardRef}
            className={`mx-auto min-w-0 ${activeTab === 'lanes' ? 'max-w-none' : 'max-w-4xl'}`}
            hidden={detailKind !== undefined}
          >
            {FILTERABLE_TABS.has(activeTab) && (
              <BoardFilterPanel target={currentCase} filter={filter} result={filterResult} onChange={setFilter} />
            )}
            {activeTab === 'timeline' && (
              <TimelineView target={currentCase} shownClaimIds={isFiltered ? filterResult.shownClaimIds : undefined} />
            )}
            {activeTab === 'graph' && <GraphView target={filteredCase} dropPersonsWithoutClaims={isFiltered} />}
            {activeTab === 'speaker' && <SpeakerView target={filteredCase} />}
            {activeTab === 'lanes' && <PersonLaneView target={filteredCase} axisRange={filter.when} />}
            {activeTab === 'map' && <MapView target={filteredCase} />}
            {activeTab === 'hypotheses' && <HypothesisListView target={currentCase} />}
            {activeTab === 'disputes' && <DisputeListView target={currentCase} />}
            {activeTab === 'tasks' && <TaskListView target={currentCase} />}
          </div>

          {detailKind && (
            <section
              aria-label={DETAIL_LABELS[detailKind]}
              className={`mx-auto min-w-0 ${detailKind === 'dispute' ? 'max-w-6xl' : 'max-w-4xl'}`}
            >
              {children}
            </section>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
