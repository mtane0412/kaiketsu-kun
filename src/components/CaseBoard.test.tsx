/**
 * ボード全体（タブ切り替え・証言の詳細ページへの導線・エンティティのパネル）のテスト
 *
 * 保存データの復元は CaseStoreGate が担うため、実際の画面と同じく CaseStoreGate の中に描画します。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { CaseBoard } from './CaseBoard';
import { CaseStoreGate } from './CaseStoreGate';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** サンプルの案件を保存済みの状態にして、ボードを描画します。 */
function renderBoard() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
  render(
    <CaseStoreGate>
      <CaseBoard />
    </CaseStoreGate>
  );
}

beforeEach(() => {
  useCaseStore.getState().resetCase();
  resetMockNavigation();
});

describe('CaseBoard', () => {
  it('保存済みの案件を復元して時系列のボードを最初に表示し、証言者別に切り替えられる', async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByDisplayValue('湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '時系列' })).getByText(/夜9時ごろ、/)).toBeInTheDocument();
    // 入力はボードへの書き足しに一本化したため、入力専用のタブは持たない
    expect(screen.queryByRole('tab', { name: '入力' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '証言者別' }));
    expect(screen.getByRole('region', { name: '隣家の住人' })).toBeInTheDocument();
    // 検証: 詳細ページからブラウザの「戻る」で同じタブに戻れるよう、タブはURLに持たせる
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/?tab=speaker', { scroll: false });
  });

  it('URLに tab=map を指定して開くと、地図のタブを最初に表示する', async () => {
    resetMockNavigation('/?tab=map');
    renderBoard();

    expect(await screen.findByRole('tab', { name: '地図' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: '地図に表示できない証言' })).toBeInTheDocument();
  });

  it('「地図」に切り替えると地図ビューを表示し、証言のメンションからエンティティの編集を開ける', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole('tab', { name: '地図' }));

    // 前提: サンプルの案件の場所には座標が無いため、湖畔の別荘に言及する証言（2件）は「地図に表示できない証言」に並ぶ
    const 一覧 = screen.getByRole('region', { name: '地図に表示できない証言' });
    await user.click(within(一覧).getAllByRole('button', { name: '@湖畔の別荘' })[0]!);

    const panel = screen.getByRole('complementary', { name: '登録済みの一覧' });
    expect(within(panel).getByRole('heading', { name: '場所を編集' })).toBeInTheDocument();
  });

  it('ボード上のメンションを選ぶと、そのエンティティの編集をパネルに開き、閉じられる', async () => {
    const user = userEvent.setup();
    renderBoard();

    const 隣家の証言 = (await screen.findByText(/夜9時ごろ、/)).closest('li')!;
    await user.click(within(隣家の証言).getByRole('button', { name: '@湖畔の別荘' }));

    const panel = screen.getByRole('complementary', { name: '登録済みの一覧' });
    expect(within(panel).getByRole('heading', { name: '場所を編集' })).toBeInTheDocument();
    expect(within(panel).getByLabelText('名前')).toHaveValue('湖畔の別荘');

    await user.click(within(panel).getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('complementary', { name: '登録済みの一覧' })).not.toBeInTheDocument();
  });

  it('証言のカードは、その証言の詳細ページへのリンクになる（編集の導線は詳細ページに一本化している）', async () => {
    renderBoard();

    const 隣家の証言 = (await screen.findByText(/夜9時ごろ、/)).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: /を開く$/ })).toHaveAttribute('href', '/claims/claim-neighbor');
    expect(within(隣家の証言).queryByRole('button', { name: 'この証言を編集' })).not.toBeInTheDocument();
    expect(within(隣家の証言).queryByRole('button', { name: 'この証言の詳細' })).not.toBeInTheDocument();
  });

  it('地図のタブの証言のカードは、戻り先のタブを引き継いだURLへのリンクになる', async () => {
    resetMockNavigation('/?tab=map');
    renderBoard();

    const 一覧 = await screen.findByRole('region', { name: '地図に表示できない証言' });
    const 隣家の証言 = within(一覧).getByText(/夜9時ごろ、/).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: /を開く$/ })).toHaveAttribute('href', '/claims/claim-neighbor?tab=map');
  });

  it('「登録済みの一覧」から、ボードに現れていないエンティティも編集・削除できるパネルを開く', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole('button', { name: '登録済みの一覧' }));

    const panel = screen.getByRole('complementary', { name: '登録済みの一覧' });
    expect(within(panel).getByRole('tablist', { name: '入力する種類' })).toBeInTheDocument();
  });
});
