/**
 * 案件ツールバー
 *
 * 案件名の変更、JSONの書き出しと読み込み、架空のサンプルの読み込み、空の案件への初期化を行います。
 *
 * 注意: この段階ではスキーマのマイグレーションが無いため、JSONの書き出しが入力済みデータを守る唯一の手段です。
 * 入力済みの案件を置き換える操作は、実行前に確認します。
 */
'use client';

import { useState, type ChangeEvent } from 'react';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';

const BUTTON_CLASS = 'rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50';

/** 案件にデータが1件でも入力されているかどうかを判定します。 */
function hasAnyData(target: Case): boolean {
  return (
    target.sources.length +
      target.persons.length +
      target.places.length +
      target.events.length +
      target.claims.length +
      target.relationships.length >
    0
  );
}

export function CaseToolbar() {
  const currentCase = useCaseStore((state) => state.currentCase);
  const renameCase = useCaseStore((state) => state.renameCase);
  const replaceCase = useCaseStore((state) => state.replaceCase);
  const resetCase = useCaseStore((state) => state.resetCase);
  const [error, setError] = useState<string | null>(null);

  /** 入力済みの案件を置き換えてよいかを確認します。空の案件では確認しません。 */
  const confirmOverwrite = (action: string): boolean => {
    if (!hasAnyData(currentCase)) return true;
    return window.confirm(`${action}と、現在の案件「${currentCase.name}」の内容は失われます。続けますか？`);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(currentCase, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentCase.name}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを続けて選び直せるよう、選択状態を戻す
    event.target.value = '';
    if (!file || !confirmOverwrite('JSONを読み込む')) return;

    try {
      replaceCase(JSON.parse(await file.text()));
      setError(null);
    } catch (caught) {
      setError(`「${file.name}」を読み込めませんでした\n${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  const handleLoadSample = () => {
    if (!confirmOverwrite('サンプルを読み込む')) return;
    replaceCase(sampleFictionalCase);
    setError(null);
  };

  const handleReset = () => {
    if (!confirmOverwrite('空の案件にする')) return;
    resetCase();
    setError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="案件名"
          value={currentCase.name}
          onChange={(event) => renameCase(event.target.value)}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xl font-bold text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none"
        />
        <button type="button" onClick={handleExport} className={BUTTON_CLASS}>
          JSONを書き出す
        </button>
        <label className={`${BUTTON_CLASS} cursor-pointer`}>
          JSONを読み込む
          <input type="file" accept="application/json,.json" onChange={handleImport} className="sr-only" />
        </label>
        <button type="button" onClick={handleLoadSample} className={BUTTON_CLASS}>
          架空のサンプルを読み込む
        </button>
        <button type="button" onClick={handleReset} className={`${BUTTON_CLASS} text-red-600`}>
          空の案件にする
        </button>
      </div>
      {error && (
        <p role="alert" className="whitespace-pre-line rounded bg-red-50 px-2 py-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
