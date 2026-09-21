/**
 * 入力パネル（種類の切り替え・新規登録・編集・削除）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { useCaseStore } from '@/stores/useCaseStore';
import { EntryPanel } from './EntryPanel';

beforeEach(() => {
  useCaseStore.getState().replaceCase(sampleFictionalCase);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EntryPanel', () => {
  it('initial を渡すと、その種類を選び、そのエンティティの編集から始める', () => {
    // ボード上のメンションから開いた場合の入り口
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    expect(screen.getByRole('tab', { name: /人物/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '人物を編集' })).toBeInTheDocument();
    expect(screen.getByLabelText('名前')).toHaveValue('管理人');
  });

  it('人物を登録すると、登録済みの一覧に表示する', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /人物/ }));
    await user.type(screen.getByLabelText('名前'), '郵便配達員');
    await user.type(screen.getByLabelText('別名（読点区切り）'), '配達員、郵便屋');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(within(screen.getByRole('list', { name: '登録済みの人物' })).getByText('郵便配達員')).toBeInTheDocument();
    expect(useCaseStore.getState().currentCase.persons.at(-1)).toMatchObject({
      name: '郵便配達員',
      aliases: ['配達員', '郵便屋'],
    });
  });

  it('種類の選択肢に「出来事」は無い（語られる出来事は、すべて誰かの証言として書く）', () => {
    render(<EntryPanel />);

    expect(screen.queryByRole('tab', { name: /出来事/ })).not.toBeInTheDocument();
  });

  it('証言から参照されている人物を削除しようとすると、理由を示して削除しない', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /人物/ }));
    await user.click(screen.getByRole('button', { name: '別荘の持ち主を削除' }));

    expect(screen.getByRole('alert')).toHaveTextContent('他のデータから参照されているため削除できません');
    expect(useCaseStore.getState().currentCase.persons).toHaveLength(sampleFictionalCase.persons.length);
  });

  it('証言の一覧に、誰の発言かと、誰を経由して伝わったかを示す', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /証言/ }));
    const 一覧 = screen.getByRole('list', { name: '登録済みの証言' });

    // 前提: 管理人の証言は書籍を経由し、防犯カメラの記録は県警と架空日報を経由している
    const 管理人の証言 = within(一覧).getByText(/^夜7時に見回りをしたとき/).closest('li')!;
    expect(管理人の証言).toHaveTextContent('管理人（湖畔の夏 20年目の証言（架空の書籍） による）');
    const 防犯カメラの記録 = within(一覧).getByText(/^夜8時10分ごろ/).closest('li')!;
    expect(防犯カメラの記録).toHaveTextContent('県道の防犯カメラ（県警 → 架空日報 朝刊 による）');
    // 発言者を選んでいない証言は、ユーザーの推測として示す
    const 推測 = within(一覧).getByText(/^@管理人の証言は事件の20年後/).closest('li')!;
    expect(推測).toHaveTextContent('ユーザーの推測');
  });

  it('見出しのある証言は、証言の一覧に本文の冒頭ではなく見出しを表示する', async () => {
    // 前提: 隣家の住人の証言に見出しが付いている
    useCaseStore.getState().replaceCase({
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-neighbor' ? { ...claim, title: '夜9時に持ち主を庭で見た' } : claim
      ),
    });
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /証言/ }));
    const 一覧 = screen.getByRole('list', { name: '登録済みの証言' });

    expect(within(一覧).getByText('夜9時に持ち主を庭で見た')).toBeInTheDocument();
    expect(within(一覧).queryByText(/^夜9時ごろ、/)).not.toBeInTheDocument();
  });

  it('登録済みの証言の編集を選ぶと、フォームに内容を読み込み、取り消しで新規登録に戻る', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /証言/ }));
    await user.click(screen.getByRole('button', { name: /^夜7時に見回りをしたとき.*を編集/ }));

    expect(screen.getByLabelText('内容')).toHaveValue(
      '夜7時に見回りをしたとき、@湖畔の別荘はすでに真っ暗で、@別荘の持ち主の車も無かった。'
    );

    // 検証: 発言者と経由は本文ではなく「発言者」に読み込む
    expect(
      screen.getByRole('button', { name: '発言者: 管理人（湖畔の夏 20年目の証言（架空の書籍） による）' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '編集を取り消す' }));

    expect(screen.getByLabelText('内容')).toHaveValue('');
  });
});
