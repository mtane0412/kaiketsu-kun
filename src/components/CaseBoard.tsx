/**
 * ボード全体
 *
 * 画面を「左のサイドバー（CaseSidebar）」と「メインの1カラム」の2つに分けます。
 * サイドバーは、ケースの切り替え・表示の切り替え（時系列・グラフ・証言者別・人物の動き・地図・仮説・未了事項）・登録済みの一覧（人物・場所・証言）を担います。
 * メインのカラムは、ボード（いま開いている表示）か、証言・人物・場所・仮説・未了事項の詳細のどちらか一方だけを表示します。
 * 以前はボードの上にタブを並べ、「登録済みの一覧」をボードを覆うオーバーレイで開いていましたが、
 * どちらもナビゲーションのため、サイドバーに集約しました。
 *
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * 証言・人物・場所の編集は、それぞれの詳細（ClaimDetail・EntityDetail）で行います。詳細のルート
 * （/claims/<証言のID>・/persons/<人物のID>・/places/<場所のID>）と、人物・場所を新しく登録するルート
 * （/persons/new・/places/new）と、仮説の詳細・登録のルート（/hypotheses/<仮説のID>・/hypotheses/new）と、
 * 未了事項の詳細・登録のルート（/tasks/<未了事項のID>・/tasks/new）では、
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
 * useSearchParams・usePathname を使うため、ページでは Suspense の中に置いてください。
 *
 * キーボードだけで操作できるよう、ページの先頭に「本文へ移動」のリンク（サイドバーを飛ばしてメインの領域へ移るリンク）を置き、
 * Esc で詳細を閉じる・「/」と ⌘K で検索窓へ移るショートカットを受け付けます（useBoardShortcuts）。
 */
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, type ReactNode } from 'react';
import { useCurrentCase } from '@/stores/useCaseStore';
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { BOARD_SEARCH_INPUT_ID, CaseSidebar } from './CaseSidebar';
import { useBoardScrollRestoration } from './useBoardScrollRestoration';
import { useBoardShortcuts } from './useBoardShortcuts';
import { useCaseId } from './useCaseId';
import { boardHref, parseDetailKind, parseTab, TAB_SEARCH_PARAM, TABS, type DetailKind, type TabKey } from './routes';
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
  search: '検索結果',
  newPerson: '人物の登録',
  newPlace: '場所の登録',
  newHypothesis: '仮説の登録',
  newTask: '未了事項の登録',
  newInterview: '資料の登録',
};

/** 「本文へ移動」のリンクの移り先となる、メインの領域のIDです。 */
const BOARD_MAIN_ID = 'board-main';

/**
 * ボードのキーボードショートカットを受け付けます（useBoardShortcuts）。
 * 検索窓はサイドバーの中にあるため、サイドバーを閉じているときは開いてからフォーカスを移します。
 * サイドバーの開閉の状態（useSidebar）を使うため、SidebarProvider の中に置いてください。
 */
function BoardShortcuts({ isDetailOpen, tab }: { isDetailOpen: boolean; tab: TabKey }) {
  const caseId = useCaseId();
  const router = useRouter();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();

  const focusSearch = useCallback(() => {
    const focusInput = () => document.getElementById(BOARD_SEARCH_INPUT_ID)?.focus();
    if (isMobile) setOpenMobile(true);
    else setOpen(true);
    // サイドバーを開いた直後は、検索窓がまだ描画されていない（または隠れている）ことがあるため、次の描画を待ってから移る
    focusInput();
    requestAnimationFrame(focusInput);
  }, [isMobile, setOpen, setOpenMobile]);

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
            {activeTab === 'timeline' && <TimelineView target={currentCase} />}
            {activeTab === 'graph' && <GraphView target={currentCase} />}
            {activeTab === 'speaker' && <SpeakerView target={currentCase} />}
            {activeTab === 'lanes' && <PersonLaneView target={currentCase} />}
            {activeTab === 'map' && <MapView target={currentCase} />}
            {activeTab === 'hypotheses' && <HypothesisListView target={currentCase} />}
            {activeTab === 'tasks' && <TaskListView target={currentCase} />}
          </div>

          {detailKind && (
            <section aria-label={DETAIL_LABELS[detailKind]} className="mx-auto min-w-0 max-w-4xl">
              {children}
            </section>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
