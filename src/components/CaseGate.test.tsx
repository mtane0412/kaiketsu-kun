/**
 * ケースを開く枠（CaseGate）のテスト
 */
import { act, render, screen } from '@testing-library/react';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { CASE_KEY_PREFIX, DATABASE_NAME, LEGACY_STORAGE_KEY, listCaseSummaries, saveCase } from '@/lib/case-storage';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { CaseGate } from './CaseGate';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 開いているケースの名前を表示するだけの、テスト用の画面です。 */
function CaseNameDisplay() {
  const currentCase = useCurrentCase();
  return <p>ケース名: {currentCase.name}</p>;
}

/** ケースを開く枠の中に、テスト用の画面を描画します。 */
function renderInFrame(caseId: string) {
  return render(
    <CaseGate caseId={caseId}>
      <CaseNameDisplay />
    </CaseGate>
  );
}

beforeEach(() => {
  useCaseStore.setState({ currentCase: null, summaries: [], loadError: null, saveError: null });
});

describe('CaseGate', () => {
  it('保存済みのケースを開いてから、中の画面を表示する', async () => {
    await saveCase(sampleFictionalCase);

    renderInFrame(sampleFictionalCase.id);

    expect(await screen.findByText('ケース名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
  });

  it('変更を保存できなかった場合は、中の画面を残したまま、理由と対処を示す', async () => {
    await saveCase(sampleFictionalCase);
    renderInFrame(sampleFictionalCase.id);
    await screen.findByText('ケース名: 湖畔の別荘失踪事件（架空）');

    act(() => useCaseStore.setState({ saveError: '変更をブラウザに保存できませんでした。' }));

    expect(screen.getByRole('alert')).toHaveTextContent('変更をブラウザに保存できませんでした。');
    expect(screen.getByText('ケース名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
  });

  it('保存されていないケースのIDでは、見つからないことと、一覧への導線を示す', async () => {
    renderInFrame('case-unknown');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ケースが見つかりません');
    // 前提: 退避したデータは無いため、退避先の案内は出さない（誤った対処へ誘導しないため）
    expect(alert).not.toHaveTextContent('退避しました');
    expect(screen.getByRole('link', { name: 'ケースの一覧へ' })).toHaveAttribute('href', '/');
  });

  it('保存データが検証に失敗した場合は、理由と退避先を示す', async () => {
    // 前提: データモデルの変更などで、保存済みのデータが検証に通らなくなった
    await listCaseSummaries();
    const database = await openDB(DATABASE_NAME);
    await database.put('cases', { id: 'case-broken' }, 'case-broken');
    database.close();

    renderInFrame('case-broken');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ケースを開けませんでした');
    expect(alert).toHaveTextContent('ケースデータの形式が正しくありません');
    expect(alert).toHaveTextContent('backups');
  });

  it('LocalStorage から移せなかったケースでは、見つからないとは言わずに、データが LocalStorage に残っていることと理由を示す', async () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-unmigrated`, '{"id":"case-unmigrated"}');

    renderInFrame('case-unmigrated');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ケースを開けませんでした');
    expect(alert).toHaveTextContent('以前の保存先（LocalStorage）から移せませんでした');
    expect(alert).toHaveTextContent('ケースデータの形式が正しくありません');
  });

  it('LocalStorage に保存していた頃のケースを、新しい保存先へ移してから開く', async () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`, JSON.stringify(sampleFictionalCase));

    renderInFrame(sampleFictionalCase.id);

    expect(await screen.findByText('ケース名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
    expect(localStorage.getItem(`${CASE_KEY_PREFIX}${sampleFictionalCase.id}`)).toBeNull();
  });

  it('1件だけ保存していた頃のデータを移行してから、そのケースを開く', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase } }));

    renderInFrame(sampleFictionalCase.id);

    expect(await screen.findByText('ケース名: 湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
    expect((await listCaseSummaries()).map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
  });
});
