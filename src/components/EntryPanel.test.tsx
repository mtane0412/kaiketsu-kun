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

  it('出来事を、見立ての日時・場所・関与人物とともに登録する', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /出来事/ }));
    await user.type(screen.getByLabelText('タイトル'), '警察が別荘を捜索した');
    await user.type(screen.getByLabelText('起きた時点（見立て）：表記'), '8月15日');
    await user.type(screen.getByLabelText('起きた時点（見立て）：最も早い時点'), '1998-08-15');
    await user.selectOptions(screen.getByLabelText('場所（見立て）'), '湖畔の別荘');
    await user.click(screen.getByRole('checkbox', { name: '管理人' }));
    await user.click(screen.getByRole('button', { name: '出来事を保存' }));

    expect(useCaseStore.getState().currentCase.events.at(-1)).toMatchObject({
      title: '警察が別荘を捜索した',
      when: { text: '8月15日', earliest: '1998-08-15' },
      placeId: 'place-villa',
      participantIds: ['person-caretaker'],
    });
  });

  it('主張から参照されている人物を削除しようとすると、理由を示して削除しない', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /人物/ }));
    await user.click(screen.getByRole('button', { name: '別荘の持ち主を削除' }));

    expect(screen.getByRole('alert')).toHaveTextContent('他のデータから参照されているため削除できません');
    expect(useCaseStore.getState().currentCase.persons).toHaveLength(sampleFictionalCase.persons.length);
  });

  it('登録済みの主張の編集を選ぶと、フォームに内容を読み込み、取り消しで新規登録に戻る', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /主張/ }));
    await user.click(screen.getByRole('button', { name: /夜7時に見回りをしたとき.*を編集/ }));

    expect(screen.getByLabelText('内容')).toHaveValue('夜7時に見回りをしたとき、別荘はすでに真っ暗で、車も無かった。');

    await user.click(screen.getByRole('button', { name: '編集を取り消す' }));

    expect(screen.getByLabelText('内容')).toHaveValue('');
  });
});
