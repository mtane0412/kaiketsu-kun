/**
 * ケース設定のメニュー（ケース名の変更・JSONの書き出し・ケースの削除）のテスト
 *
 * ケース名の変更・JSONの書き出し・ケースの削除は、毎日使う操作ではないため、
 * サイドバーの一等地ではなくメニューの中に置いています。テストもメニューを開くところから始めます。
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
import { CaseSettingsMenu } from './CaseSettingsMenu';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 実際の画面と同じく、ケースを開く枠（CaseGate）の中にメニューを描画します。 */
function メニューを描画する() {
  render(
    <CaseGate caseId={sampleFictionalCase.id}>
      <CaseSettingsMenu />
    </CaseGate>
  );
}

/** ケース設定のメニューを開きます。 */
async function メニューを開く(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'ケース設定' }));
}

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CaseSettingsMenu', () => {
  it('ケース名を変更する', async () => {
    const user = userEvent.setup();
    メニューを描画する();

    await メニューを開く(user);
    await user.click(await screen.findByRole('menuitem', { name: 'ケース名を変更' }));

    await user.clear(await screen.findByLabelText('ケース名'));
    await user.type(screen.getByLabelText('ケース名'), '湖畔の事件');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useCaseStore.getState().currentCase?.name).toBe('湖畔の事件');
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
    メニューを描画する();

    await メニューを開く(user);
    await user.click(await screen.findByRole('menuitem', { name: 'JSONを書き出す' }));

    expect(JSON.parse(await exported!.text())).toEqual(sampleFictionalCase);
  });

  it('ケースを削除する前に確認し、承認された場合は削除して一覧へ移る', async () => {
    const user = userEvent.setup();
    メニューを描画する();

    await メニューを開く(user);
    await user.click(await screen.findByRole('menuitem', { name: 'このケースを削除' }));
    // 削除は取り消せないため、確認の画面で改めて承認する
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(listCaseSummaries()).toEqual([]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('ケースの削除が取り消された場合は、ケースを消さない', async () => {
    const user = userEvent.setup();
    メニューを描画する();

    await メニューを開く(user);
    await user.click(await screen.findByRole('menuitem', { name: 'このケースを削除' }));
    await user.click(await screen.findByRole('button', { name: 'やめる' }));

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
