/**
 * ボード全体
 *
 * ツールバーと、時系列のボード（ホワイトボード）を表示します。
 * タブで、証言者別の表示と、時系列を地図上でたどる表示に切り替えられます。
 * タブはURLのクエリ（?tab=）に持たせます（src/components/routes.ts を参照）。
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * 証言の編集は、証言のカードから開く詳細ページ（ClaimDetail）で行います。
 * 人物・場所の編集は、ボード上のメンション、または「登録済みの一覧」から、
 * 画面の右側のパネル（EntryPanel）に開きます。
 *
 * 注意: 保存済みの案件の復元は CaseStoreGate が担います。このコンポーネントは CaseStoreGate の中に置いてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { CaseToolbar } from './CaseToolbar';
import { ENTRY_KEY_BY_MENTION_KIND, EntryPanel, type EntryKey } from './EntryPanel';
import { boardHref, parseTab, TAB_SEARCH_PARAM, TABS } from './routes';
import { MapView } from './views/MapView';
import { SpeakerView } from './views/SpeakerView';
import { TimelineView } from './views/TimelineView';

const PANEL_LABEL = '登録済みの一覧';

/** 右側のパネルの状態です。entity が null の場合は、編集対象を決めずに一覧を開いています。 */
type PanelState = { entity: { key: EntryKey; id: Id } | null };

/** ボード上で選ばれたメンションを、右側のパネルの編集対象に変換します。 */
function panelStateOfMention(kind: MentionKind, id: Id): PanelState {
  return { entity: { key: ENTRY_KEY_BY_MENTION_KIND[kind], id } };
}

export function CaseBoard() {
  const currentCase = useCaseStore((state) => state.currentCase);
  const router = useRouter();
  const activeTab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const [panel, setPanel] = useState<PanelState | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <CaseToolbar />

      <div className="flex items-end justify-between border-b border-slate-200">
        <div role="tablist" aria-label="表示の切り替え" className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === activeTab}
              // タブの切り替えは履歴に積まない（詳細ページから「戻る」で、最後に見ていたタブに戻るため）
              onClick={() => router.replace(boardHref(tab.key), { scroll: false })}
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
            onOpenEntity={(kind, id) => setPanel(panelStateOfMention(kind, id))}
          />
        )}
        {activeTab === 'speaker' && <SpeakerView target={currentCase} />}
        {activeTab === 'map' && (
          <MapView target={currentCase} onOpenEntity={(kind, id) => setPanel(panelStateOfMention(kind, id))} />
        )}
      </main>

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
