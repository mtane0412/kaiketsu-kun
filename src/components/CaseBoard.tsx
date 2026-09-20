/**
 * ボード全体
 *
 * ブラウザに保存済みの案件を復元したうえで、ツールバーと、時系列のボード（ホワイトボード）を表示します。
 * 入力はボードへの書き足しに一本化しており、入力専用の画面は持ちません。
 * エンティティの編集は、ボード上のメンション・出来事の見出し、または「登録済みの一覧」から、
 * 画面の右側のパネル（EntryPanel）に開きます。
 *
 * 注意: ストアは skipHydration を有効にしているため、このコンポーネントがマウント時に復元を実行します。
 * 復元が終わるまでは、空の案件が一瞬表示されて保存データを上書きすることを避けるため、何も描画しません。
 */
'use client';

import { useEffect, useState } from 'react';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';
import { BACKUP_STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';
import { CaseToolbar } from './CaseToolbar';
import { EntryPanel, type EntryKey } from './EntryPanel';
import { SpeakerView } from './views/SpeakerView';
import { TimelineView } from './views/TimelineView';

const TABS = [
  { key: 'timeline', label: '時系列' },
  { key: 'speaker', label: '証言者別' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const PANEL_LABEL = '登録済みの一覧';

/** メンションの種類に対応する、登録済みの一覧の種類です。 */
const ENTRY_KEY_BY_MENTION_KIND: Record<MentionKind, EntryKey> = {
  person: 'persons',
  place: 'places',
  event: 'events',
  source: 'sources',
};

/** 右側のパネルの状態です。entity が null の場合は、編集対象を決めずに一覧を開いています。 */
type PanelState = { entity: { key: EntryKey; id: Id } | null };

export function CaseBoard() {
  const currentCase = useCaseStore((state) => state.currentCase);
  const loadError = useCaseStore((state) => state.loadError);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('timeline');
  const [panel, setPanel] = useState<PanelState | null>(null);

  useEffect(() => {
    let isActive = true;
    Promise.resolve(useCaseStore.persist.rehydrate()).then(() => {
      if (isActive) setIsHydrated(true);
    });
    return () => {
      isActive = false;
    };
  }, []);

  if (!isHydrated) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <CaseToolbar />

      {loadError && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">保存済みの案件を復元できませんでした</p>
          <p className="mt-1">
            保存されていたデータは、ブラウザのLocalStorageのキー <code>{BACKUP_STORAGE_KEY}</code> に退避しました。
            データモデルの変更が原因の場合は、退避したデータを変換して「JSONを読み込む」から読み込んでください。
          </p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{loadError}</pre>
        </div>
      )}

      <div className="flex items-end justify-between border-b border-slate-200">
        <div role="tablist" aria-label="表示の切り替え" className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.key === activeTab}
              onClick={() => setActiveTab(tab.key)}
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
            onOpenEntity={(kind, id) => setPanel({ entity: { key: ENTRY_KEY_BY_MENTION_KIND[kind], id } })}
          />
        )}
        {activeTab === 'speaker' && <SpeakerView target={currentCase} />}
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
