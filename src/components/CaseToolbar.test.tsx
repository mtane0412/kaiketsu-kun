/**
 * 案件ツールバー（案件名の変更・JSONの書き出し・案件の削除・一覧への導線）のテスト
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { listCaseSummaries } from '@/lib/case-storage';
import { useCaseStore } from '@/stores/useCaseStore';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { openTestCase } from '@/test/open-case';
import { CaseGate } from './CaseGate';
import { CaseToolbar } from './CaseToolbar';

/** 実際の画面と同じく、案件を開く枠（CaseGate）の中にツールバーを描画します。 */
function ツールバーを描画する() {
  return render(
    <CaseGate caseId={sampleFictionalCase.id}>
      <CaseToolbar />
    </CaseGate>
  );
}

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CaseToolbar', () => {
  it('案件名を変更する', async () => {
    const user = userEvent.setup();
    ツールバーを描画する();

    await user.clear(screen.getByLabelText('案件名'));
    await user.type(screen.getByLabelText('案件名'), '湖畔の事件');

    expect(useCaseStore.getState().currentCase?.name).toBe('湖畔の事件');
  });

  it('案件の一覧へ戻るリンクを表示する', () => {
    ツールバーを描画する();

    expect(screen.getByRole('link', { name: '案件の一覧' })).toHaveAttribute('href', '/');
  });

  it('現在の案件をJSONファイルとして書き出す', async () => {
    const user = userEvent.setup();
    let exported: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return 'blob:exported-case';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    ツールバーを描画する();

    await user.click(screen.getByRole('button', { name: 'JSONを書き出す' }));

    expect(JSON.parse(await exported!.text())).toEqual(sampleFictionalCase);
  });

  it('案件を削除する前に確認し、承認された場合は削除して一覧へ移る', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    ツールバーを描画する();

    await user.click(screen.getByRole('button', { name: 'この案件を削除' }));

    expect(listCaseSummaries()).toEqual([]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('案件の削除が取り消された場合は、案件を消さない', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    ツールバーを描画する();

    await user.click(screen.getByRole('button', { name: 'この案件を削除' }));

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
