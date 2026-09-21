/**
 * 保存データの復元を待つ枠（CaseStoreGate）のテスト
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';
import { CaseStoreGate } from './CaseStoreGate';

/** 復元した案件の名前を表示するだけの、テスト用の画面です。 */
function 案件名の表示() {
  const name = useCaseStore((state) => state.currentCase.name);
  return <p>案件名: {name}</p>;
}

beforeEach(() => {
  useCaseStore.getState().resetCase();
});

describe('CaseStoreGate', () => {
  it('保存済みの案件を復元してから、中の画面を表示する', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
    render(
      <CaseStoreGate>
        <案件名の表示 />
      </CaseStoreGate>
    );

    expect(await screen.findByText('案件名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
  });

  it('保存済みのデータを復元できなかった場合は、理由と退避先を表示する', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: { name: '古い形式の案件' } }, version: 0 }));
    render(
      <CaseStoreGate>
        <案件名の表示 />
      </CaseStoreGate>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('保存済みの案件を復元できませんでした');
    expect(alert).toHaveTextContent('testimony-board-case-backup');
  });
});
