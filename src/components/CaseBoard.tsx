/**
 * ボード全体
 *
 * 画面を「左のサイドバー（CaseSidebar）」と「ボード」の2つに分けます。
 * サイドバーは、ケースの切り替え・表示の切り替え（時系列・証言者別・地図）・登録済みの一覧（人物・場所・証言）を担います。
 * ボードは、いま開いている表示（時系列・証言者別・地図）だけを表示します。
 * 以前はボードの上にタブを並べ、「登録済みの一覧」をボードを覆うオーバーレイで開いていましたが、
 * どちらもナビゲーションのため、サイドバーに集約しました。
 *
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * 証言・人物・場所の編集は、それぞれの詳細（ClaimDetail・EntityDetail）で行います。詳細のルート
 * （/claims/<証言のID>・/persons/<人物のID>・/places/<場所のID>）と、人物・場所を新しく登録するルート
 * （/new/person・/new/place）では、詳細（children）をボードを覆わずに横へ並べます（2ペイン）。
 * 時系列を見たまま、証言・人物・場所を次々にたどれるようにするためです。
 * 画面の幅が狭い場合は横に並べられないため、詳細だけを表示します。
 *
 * 注意: このコンポーネントはレイアウト（src/app/cases/[caseId]/layout.tsx）に置きます。レイアウトはページを移っても
 * 再マウントされないため、証言を開閉しても、ボードのスクロール位置や入力中の内容を保ちます。
 * 保存済みのケースの復元は CaseGate が担います。このコンポーネントは CaseGate の中に置いてください。
 * useSearchParams・usePathname を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { useParams, usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCurrentCase } from '@/stores/useCaseStore';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { CaseSidebar } from './CaseSidebar';
import { parseDetailKind, parseTab, TAB_SEARCH_PARAM, TABS, type DetailKind } from './routes';
import { MapView } from './views/MapView';
import { SpeakerView } from './views/SpeakerView';
import { TimelineView } from './views/TimelineView';

/** ボードの横に並べる詳細の、枠に付ける名前です。読み上げで、どの枠を開いているかが分かるようにします。 */
const DETAIL_LABELS: Record<DetailKind, string> = {
  claim: '証言の詳細',
  person: '人物の詳細',
  place: '場所の詳細',
  newPerson: '人物の登録',
  newPlace: '場所の登録',
};

type CaseBoardProps = {
  /** ボードの横に並べる、証言・人物・場所の詳細（または登録フォーム）です。該当するルートでだけ表示します。 */
  children?: ReactNode;
};

export function CaseBoard({ children }: CaseBoardProps) {
  const currentCase = useCurrentCase();
  const pathname = usePathname();
  const activeTab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const params = useParams<{ claimId?: string }>();

  const detailKind = parseDetailKind(pathname);
  const isDetailOpen = detailKind !== undefined;
  /** 開いている証言のIDです。証言の詳細ページのURLでだけ値を持ち、その証言のカードを強調するために使います。 */
  const activeClaimId = params.claimId === undefined ? undefined : decodeURIComponent(params.claimId);
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)!.label;

  return (
    <SidebarProvider>
      <CaseSidebar />

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <h1 className="truncate text-sm font-semibold">{currentCase.name}</h1>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <h2 className="text-sm text-muted-foreground">{activeTabLabel}</h2>
        </header>

        <div className={`flex-1 p-4 ${isDetailOpen ? 'lg:flex lg:items-start lg:gap-4' : ''}`}>
          {/* 詳細を開いても再マウントされないよう、ボードは常に同じ位置の要素に描画する。幅が狭い画面では、詳細を開いている間は隠す */}
          <div className={`mx-auto min-w-0 flex-1 ${isDetailOpen ? 'hidden lg:block' : 'max-w-4xl'}`}>
            {activeTab === 'timeline' && <TimelineView target={currentCase} activeClaimId={activeClaimId} />}
            {activeTab === 'speaker' && <SpeakerView target={currentCase} activeClaimId={activeClaimId} />}
            {activeTab === 'map' && <MapView target={currentCase} activeClaimId={activeClaimId} />}
          </div>

          {detailKind && (
            <aside
              aria-label={DETAIL_LABELS[detailKind]}
              className="lg:sticky lg:top-18 lg:max-h-[calc(100vh-6rem)] lg:w-[30rem] lg:shrink-0 lg:overflow-y-auto"
            >
              {children}
            </aside>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
