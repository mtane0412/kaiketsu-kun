/**
 * ケースツールバー（ケース名の変更・JSONの書き出し・ケースの削除・一覧への導線）のテスト
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

/** 実際の画面と同じく、ケースを開く枠（CaseGate）の中にツールバーを描画します。 */
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
  it('ケース名を変更する', async () => {
    const user = userEvent.setup();
    ツールバーを描画する();

    await user.clear(screen.getByLabelText('ケース名'));
    await user.type(screen.getByLabelText('ケース名'), '湖畔の事件');

    expect(useCaseStore.getState().currentCase?.name).toBe('湖畔の事件');
  });

  it('ケースの一覧へ戻るリンクを表示する', () => {
    ツールバーを描画する();

    expect(screen.getByRole('link', { name: 'ケースの一覧' })).toHaveAttribute('href', '/');
  });

  it('現在のケースをJSONファイルとして書き出す', async () => {
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

  it('ケースを削除する前に確認し、承認された場合は削除して一覧へ移る', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    ツールバーを描画する();

    await user.click(screen.getByRole('button', { name: 'このケースを削除' }));

    expect(listCaseSummaries()).toEqual([]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('ケースの削除が取り消された場合は、ケースを消さない', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    ツールバーを描画する();

    await user.click(screen.getByRole('button', { name: 'このケースを削除' }));

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
