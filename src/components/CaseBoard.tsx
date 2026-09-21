/**
 * ボード全体
 *
 * ツールバーと、時系列のボード（ホワイトボード）を表示します。
 * タブで、証言者別の表示と、時系列を地図上でたどる表示に切り替えられます。
 * タブはURLのクエリ（?tab=）に持たせます（src/components/routes.ts を参照）。
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * 証言・人物・場所の編集は、それぞれの詳細（ClaimDetail・EntityDetail）で行います。詳細のルート
 * （/claims/<証言のID>・/persons/<人物のID>・/places/<場所のID>）では、詳細（children）をボードを覆わずに横へ並べます（2ペイン）。
 * 時系列を見たまま、証言・人物・場所を次々にたどれるようにするためです。
 * 画面の幅が狭い場合は横に並べられないため、詳細だけを表示します。
 * ボードに現れていないエンティティの編集・削除は、「登録済みの一覧」から、画面の右側のパネル（EntryPanel）に開きます。
 *
 * 注意: このコンポーネントはレイアウト（src/app/(board)/layout.tsx）に置きます。レイアウトはページを移っても再マウントされないため、
 * 証言を開閉しても、ボードのスクロール位置や入力中の内容を保ちます。
 * 保存済みの案件の復元は CaseStoreGate が担います。このコンポーネントは CaseStoreGate の中に置いてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { CaseToolbar } from './CaseToolbar';
import { EntryPanel } from './EntryPanel';
import { boardHref, claimHref, parseTab, personHref, placeHref, TAB_SEARCH_PARAM, TABS, type TabKey } from './routes';
import { useCaseId } from './useCaseId';
import { MapView } from './views/MapView';
import { SpeakerView } from './views/SpeakerView';
import { TimelineView } from './views/TimelineView';

const PANEL_LABEL = '登録済みの一覧';

/** ボードの横に並べられる詳細の種類です。ルートのパラメータの名前・表示名・URLの組み立て方を対応させます。 */
const DETAIL_ROUTES = [
  { param: 'claimId', label: '証言の詳細', href: claimHref },
  { param: 'personId', label: '人物の詳細', href: personHref },
  { param: 'placeId', label: '場所の詳細', href: placeHref },
] as const;

/** ルートのパラメータの名前です。 */
type DetailParams = Partial<Record<(typeof DETAIL_ROUTES)[number]['param'], string>>;

/** ボードの横に開いている詳細です。 */
type OpenDetail = { label: string; id: Id; href: (caseId: Id, id: Id, tab: TabKey) => string };

/**
 * 開いている詳細を、ルートのパラメータから読み取ります。詳細のルートでない場合は undefined を返します。
 * 注意: ルートのパラメータはURLから取り出した値のため、URLの記法を解いてからIDとして扱います。
 */
function openDetailOf(params: DetailParams): OpenDetail | undefined {
  for (const route of DETAIL_ROUTES) {
    const value = params[route.param];
    if (value !== undefined) return { label: route.label, id: decodeURIComponent(value), href: route.href };
  }
  return undefined;
}

type CaseBoardProps = {
  /** ボードの横に並べる、証言・人物・場所の詳細です。詳細のルートでだけ表示します。 */
  children?: ReactNode;
};

export function CaseBoard({ children }: CaseBoardProps) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const router = useRouter();
  const activeTab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const params = useParams<DetailParams>();
  const detail = openDetailOf(params);
  const isDetailOpen = detail !== undefined;
  /** 開いている証言のIDです。証言の詳細ページのURLでだけ値を持ち、その証言のカードを強調するために使います。 */
  const activeClaimId = params.claimId === undefined ? undefined : decodeURIComponent(params.claimId);

  return (
    <div className={`mx-auto p-4 ${isDetailOpen ? 'max-w-7xl lg:flex lg:items-start lg:gap-4' : 'max-w-5xl'}`}>
      {/* 詳細を開いても再マウントされないよう、ボードは常に同じ位置の要素に描画する。幅が狭い画面では、詳細を開いている間は隠す */}
      <div className={`min-w-0 flex-1 space-y-4 ${isDetailOpen ? 'hidden lg:block' : ''}`}>
      <CaseToolbar />

      <div className="flex items-end justify-between border-b border-slate-200">
        <div role="tablist" aria-label="表示の切り替え" className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === activeTab}
              // タブの切り替えは履歴に積まない。詳細を開いている場合は、開いたままタブだけを切り替える
              onClick={() =>
                router.replace(detail ? detail.href(caseId, detail.id, tab.key) : boardHref(caseId, tab.key), {
                  scroll: false,
                })
              }
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                tab.key === activeTab
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsPanelOpen(true)}
          className="mb-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          {PANEL_LABEL}
        </button>
      </div>

      <main>
        {activeTab === 'timeline' && <TimelineView target={currentCase} activeClaimId={activeClaimId} />}
        {activeTab === 'speaker' && <SpeakerView target={currentCase} activeClaimId={activeClaimId} />}
        {activeTab === 'map' && <MapView target={currentCase} activeClaimId={activeClaimId} />}
      </main>
      </div>

      {detail && (
        <aside
          aria-label={detail.label}
          className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-[30rem] lg:shrink-0 lg:overflow-y-auto"
        >
          {children}
        </aside>
      )}

      {isPanelOpen && (
        <aside
          aria-label={PANEL_LABEL}
          className="fixed inset-y-0 right-0 z-20 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">{PANEL_LABEL}</h2>
            <button type="button" onClick={() => setIsPanelOpen(false)} className="text-xs text-slate-600 hover:underline">
              閉じる
            </button>
          </div>
          <EntryPanel />
        </aside>
      )}
    </div>
  );
}
