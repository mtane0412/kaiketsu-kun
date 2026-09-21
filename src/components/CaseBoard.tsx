/**
 * ボード全体
 *
 * ツールバーと、時系列のボード（ホワイトボード）を表示します。
 * タブで、証言者別の表示と、時系列を地図上でたどる表示に切り替えられます。
 * タブはURLのクエリ（?tab=）に持たせます（src/components/routes.ts を参照）。
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * 証言の編集は、証言のカードから開く詳細（ClaimDetail）で行います。証言の詳細ページのURL（/claims/<証言のID>）では、
 * 詳細（children）をボードを覆わずに横へ並べます（2ペイン）。時系列を見たまま、関連する証言を次々にたどれるようにするためです。
 * 画面の幅が狭い場合は横に並べられないため、詳細だけを表示します。
 * 人物・場所の編集は、ボード上のメンション、または「登録済みの一覧」から、
 * 画面の右側のパネル（EntryPanel）に開きます。
 *
 * 注意: このコンポーネントはレイアウト（src/app/(board)/layout.tsx）に置きます。レイアウトはページを移っても再マウントされないため、
 * 証言を開閉しても、ボードのスクロール位置や入力中の内容を保ちます。
 * 保存済みの案件の復元は CaseStoreGate が担います。このコンポーネントは CaseStoreGate の中に置いてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { CaseToolbar } from './CaseToolbar';
import { ENTRY_KEY_BY_MENTION_KIND, EntryPanel, type EntryKey } from './EntryPanel';
import { boardHref, claimHref, parseTab, TAB_SEARCH_PARAM, TABS } from './routes';
import { MapView } from './views/MapView';
import { SpeakerView } from './views/SpeakerView';
import { TimelineView } from './views/TimelineView';

const PANEL_LABEL = '登録済みの一覧';

const DETAIL_LABEL = '証言の詳細';

/** 右側のパネルの状態です。entity が null の場合は、編集対象を決めずに一覧を開いています。 */
type PanelState = { entity: { key: EntryKey; id: Id } | null };

/** ボード上で選ばれたメンションを、右側のパネルの編集対象に変換します。 */
function panelStateOfMention(kind: MentionKind, id: Id): PanelState {
  return { entity: { key: ENTRY_KEY_BY_MENTION_KIND[kind], id } };
}

type CaseBoardProps = {
  /** ボードの横に並べる、証言の詳細です。証言の詳細ページのURLでだけ表示します。 */
  children?: ReactNode;
};

export function CaseBoard({ children }: CaseBoardProps) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const router = useRouter();
  const activeTab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const [panel, setPanel] = useState<PanelState | null>(null);
  /** 開いている証言のIDです。証言の詳細ページのURLでだけ値を持ちます。 */
  const { claimId: claimIdParam } = useParams<{ claimId?: string }>();
  const activeClaimId = claimIdParam === undefined ? undefined : decodeURIComponent(claimIdParam);
  const isDetailOpen = activeClaimId !== undefined;

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
              // タブの切り替えは履歴に積まない。証言を開いている場合は、開いたままタブだけを切り替える
              onClick={() =>
                router.replace(isDetailOpen ? claimHref(activeClaimId, tab.key) : boardHref(tab.key), { scroll: false })
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
          onClick={() => setPanel({ entity: null })}
          className="mb-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          {PANEL_LABEL}
        </button>
      </div>

      <main>
        {activeTab === 'timeline' && (
          <TimelineView
            target={currentCase}
            activeClaimId={activeClaimId}
            onOpenEntity={(kind, id) => setPanel(panelStateOfMention(kind, id))}
          />
        )}
        {activeTab === 'speaker' && <SpeakerView target={currentCase} activeClaimId={activeClaimId} />}
        {activeTab === 'map' && (
          <MapView
            target={currentCase}
            activeClaimId={activeClaimId}
            onOpenEntity={(kind, id) => setPanel(panelStateOfMention(kind, id))}
          />
        )}
      </main>
      </div>

      {isDetailOpen && (
        <aside
          aria-label={DETAIL_LABEL}
          className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-[30rem] lg:shrink-0 lg:overflow-y-auto"
        >
          {children}
        </aside>
      )}

      {panel && (
        <aside
          aria-label={PANEL_LABEL}
          className="fixed inset-y-0 right-0 z-20 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">{PANEL_LABEL}</h2>
            <button type="button" onClick={() => setPanel(null)} className="text-xs text-slate-600 hover:underline">
              閉じる
            </button>
          </div>
          {/* EntryPanel は initial を初期化でのみ使用するため、対象が変わるたびに再マウントする */}
          <EntryPanel
            key={panel.entity ? `${panel.entity.key}:${panel.entity.id}` : 'list'}
            initial={panel.entity ?? undefined}
          />
        </aside>
      )}
    </div>
  );
}
