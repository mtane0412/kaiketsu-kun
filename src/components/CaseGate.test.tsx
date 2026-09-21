/**
 * ケースを開く枠（CaseGate）のテスト
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { CASE_KEY_PREFIX, LEGACY_STORAGE_KEY, listCaseSummaries, saveCase } from '@/lib/case-storage';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { CaseGate } from './CaseGate';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 開いているケースの名前を表示するだけの、テスト用の画面です。 */
function ケース名の表示() {
  const currentCase = useCurrentCase();
  return <p>ケース名: {currentCase.name}</p>;
}

/** ケースを開く枠の中に、テスト用の画面を描画します。 */
function 枠の中に描画する(caseId: string) {
  return render(
    <CaseGate caseId={caseId}>
      <ケース名の表示 />
    </CaseGate>
  );
}

beforeEach(() => {
  localStorage.clear();
  useCaseStore.setState({ currentCase: null, summaries: [], loadError: null });
});

describe('CaseGate', () => {
  it('保存済みのケースを開いてから、中の画面を表示する', async () => {
    saveCase(sampleFictionalCase);

    枠の中に描画する(sampleFictionalCase.id);

    expect(await screen.findByText('ケース名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
  });

  it('保存されていないケースのIDでは、見つからないことと、一覧への導線を示す', async () => {
    枠の中に描画する('case-unknown');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ケースを開けませんでした');
    expect(screen.getByRole('link', { name: 'ケースの一覧へ' })).toHaveAttribute('href', '/');
  });

  it('保存データが検証に失敗した場合は、理由と退避先を示す', async () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    枠の中に描画する('case-broken');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ケースデータの形式が正しくありません');
    expect(alert).toHaveTextContent('testimony-board-case-backup');
  });

  it('1件だけ保存していた頃のデータを移行してから、そのケースを開く', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase } }));

    枠の中に描画する(sampleFictionalCase.id);

    expect(await screen.findByText('ケース名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
  });
});
