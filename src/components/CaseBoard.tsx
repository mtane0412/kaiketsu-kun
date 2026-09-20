/**
 * ボード全体
 *
 * ブラウザに保存済みの案件を復元したうえで、ツールバーと3つのタブ（入力・時系列・証言者別）を表示します。
 *
 * 注意: ストアは skipHydration を有効にしているため、このコンポーネントがマウント時に復元を実行します。
 * 復元が終わるまでは、空の案件が一瞬表示されて保存データを上書きすることを避けるため、何も描画しません。
 */
'use client';

import { useEffect, useState } from 'react';
import { BACKUP_STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';
import { CaseToolbar } from './CaseToolbar';
import { EntryPanel } from './EntryPanel';
import { SpeakerView } from './views/SpeakerView';
import { TimelineView } from './views/TimelineView';

const TABS = [
  { key: 'entry', label: '入力' },
  { key: 'timeline', label: '時系列' },
  { key: 'speaker', label: '証言者別' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function CaseBoard() {
  const currentCase = useCaseStore((state) => state.currentCase);
  const loadError = useCaseStore((state) => state.loadError);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('entry');

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

      <div role="tablist" aria-label="表示の切り替え" className="flex gap-1 border-b border-slate-200">
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

      <main>
        {activeTab === 'entry' && <EntryPanel />}
        {activeTab === 'timeline' && <TimelineView target={currentCase} />}
        {activeTab === 'speaker' && <SpeakerView target={currentCase} />}
      </main>
    </div>
  );
}
