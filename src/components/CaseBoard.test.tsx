/**
 * ボード全体（保存データの復元・タブ切り替え・復元失敗の表示）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';
import { CaseBoard } from './CaseBoard';

beforeEach(() => {
  useCaseStore.getState().resetCase();
});

describe('CaseBoard', () => {
  it('保存済みの案件を復元して時系列のボードを最初に表示し、証言者別に切り替えられる', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
    render(<CaseBoard />);

    expect(await screen.findByDisplayValue('湖畔の別荘失踪事件（架空）')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '持ち主が最後に目撃された' })).toBeInTheDocument();
    // 入力はボードへの書き足しに一本化したため、入力専用のタブは持たない
    expect(screen.queryByRole('tab', { name: '入力' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '証言者別' }));
    expect(screen.getByRole('region', { name: '隣家の住人' })).toBeInTheDocument();
  });

  it('ボード上のメンションを選ぶと、そのエンティティの編集をパネルに開き、閉じられる', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
    render(<CaseBoard />);

    const 隣家の証言 = (await screen.findByText(/夜9時ごろ、/)).closest('li')!;
    await user.click(within(隣家の証言).getByRole('button', { name: '@湖畔の別荘' }));

    const panel = screen.getByRole('complementary', { name: '登録済みの一覧' });
    expect(within(panel).getByRole('heading', { name: '場所を編集' })).toBeInTheDocument();
    expect(within(panel).getByLabelText('名前')).toHaveValue('湖畔の別荘');

    await user.click(within(panel).getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('complementary', { name: '登録済みの一覧' })).not.toBeInTheDocument();
  });

  it('主張の「詳細」を選ぶと、日時・ソース内の位置を編集できるフォームをパネルに開く', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
    render(<CaseBoard />);

    const 隣家の証言 = (await screen.findByText(/夜9時ごろ、/)).closest('li')!;
    await user.click(within(隣家の証言).getByRole('button', { name: 'この主張の詳細' }));

    const panel = screen.getByRole('complementary', { name: '登録済みの一覧' });
    expect(within(panel).getByRole('heading', { name: '主張を編集' })).toBeInTheDocument();
    expect(within(panel).getByLabelText('証言が述べる日時：表記')).toHaveValue('8月12日 夜9時ごろ');
  });

  it('「登録済みの一覧」から、ボードに現れていないエンティティも編集・削除できるパネルを開く', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
    render(<CaseBoard />);

    await user.click(await screen.findByRole('button', { name: '登録済みの一覧' }));

    const panel = screen.getByRole('complementary', { name: '登録済みの一覧' });
    expect(within(panel).getByRole('tablist', { name: '入力する種類' })).toBeInTheDocument();
  });

  it('保存済みのデータを復元できなかった場合は、理由と退避先を表示する', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: { name: '古い形式の案件' } }, version: 0 }));
    render(<CaseBoard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('保存済みの案件を復元できませんでした');
    expect(alert).toHaveTextContent('testimony-board-case-backup');
  });
});
