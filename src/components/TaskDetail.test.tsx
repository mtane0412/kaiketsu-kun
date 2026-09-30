/**
 * 未了事項の詳細・登録ページ（内容・状態・担当・期限・結果のメモの編集、削除、
 * 証言・人物・場所のひもづけ、結果を証言として書き足す導線）のテスト
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Task } from '@/domain/types';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { openedCase, openTestCase } from '@/test/open-case';
import { NewTaskDetail, TaskDetail } from './TaskDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: 「管理人に、19時に見回りをした理由を再度聞く」は未着手で、期限は1998-08-18、
  // 管理人の証言・管理人・湖畔の別荘をひもづけている
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/tasks/task-caretaker?tab=tasks');
});

/** 開いているケースから、未了事項を取り出します。 */
function findTask(id: string): Task {
  const task = openedCase().tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`未了事項が見つかりません: ${id}`);
  return task;
}

describe('TaskDetail（未了事項の編集）', () => {
  it('内容・状態・担当・期限・結果のメモを変えて保存できる', async () => {
    const user = userEvent.setup();
    render(<TaskDetail taskId="task-caretaker" />);

    const editButton = screen.getByRole('region', { name: '未了事項の編集' });
    const content = within(editButton).getByRole('textbox', { name: '内容' });
    await user.clear(content);
    await user.type(content, '管理人に、見回りの時刻を再度聞く');
    await user.click(within(editButton).getByRole('radio', { name: '完了' }));
    await user.type(within(editButton).getByRole('textbox', { name: '担当' }), '捜査2係');
    fireEvent.change(within(editButton).getByLabelText('期限'), { target: { value: '1998-08-25' } });
    await user.type(within(editButton).getByRole('textbox', { name: '結果のメモ' }), '見回りは19時ではなく22時だったと訂正した。');
    await user.click(within(editButton).getByRole('button', { name: '未了事項を保存' }));

    expect(findTask('task-caretaker')).toMatchObject({
      content: '管理人に、見回りの時刻を再度聞く',
      status: 'done',
      assignee: '捜査2係',
      due: '1998-08-25',
      resultNote: '見回りは19時ではなく22時だったと訂正した。',
    });
    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
  });

  it('担当と期限を空にして保存すると、それらの項目を取り除く', async () => {
    const user = userEvent.setup();
    render(<TaskDetail taskId="task-camera" />);

    const editButton = screen.getByRole('region', { name: '未了事項の編集' });
    await user.clear(within(editButton).getByRole('textbox', { name: '担当' }));
    fireEvent.change(within(editButton).getByLabelText('期限'), { target: { value: '' } });
    await user.click(within(editButton).getByRole('button', { name: '未了事項を保存' }));

    expect(findTask('task-camera').assignee).toBeUndefined();
    expect(findTask('task-camera').due).toBeUndefined();
  });

  it('保存しても、詳細でひもづけた証言・人物・場所を失わない', async () => {
    const user = userEvent.setup();
    render(<TaskDetail taskId="task-caretaker" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '対象の証言を追加' }), 'claim-report');
    await user.click(screen.getByRole('button', { name: '未了事項を保存' }));

    expect(findTask('task-caretaker').claimIds).toEqual(['claim-caretaker', 'claim-report']);
  });

  it('削除すると、ケースから取り除き、ボードへ戻る', async () => {
    const user = userEvent.setup();
    render(<TaskDetail taskId="task-caretaker" />);

    await user.click(screen.getByRole('button', { name: 'この未了事項を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(openedCase().tasks.some((task) => task.id === 'task-caretaker')).toBe(false);
    expect(mockRouter.replace).toHaveBeenCalledWith('/cases/case-lakeside?tab=tasks');
  });

  it('ケースに無い未了事項のIDでは、見つからないことを表示する', () => {
    render(<TaskDetail taskId="task-gone" />);

    expect(screen.getByRole('heading', { name: '未了事項が見つかりません' })).toBeInTheDocument();
  });
});

describe('TaskDetail（ひもづけ）', () => {
  it('ひもづけた証言・人物・場所を、それぞれの詳細へのリンクで並べる', () => {
    render(<TaskDetail taskId="task-caretaker" />);

    const claim = screen.getByRole('region', { name: '対象の証言' });
    expect(within(claim).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker?tab=tasks'
    );
    const person = screen.getByRole('region', { name: '対象の人物' });
    expect(within(person).getByRole('link', { name: '管理人' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-caretaker?tab=tasks'
    );
    const place = screen.getByRole('region', { name: '対象の場所' });
    expect(within(place).getByRole('link', { name: '湖畔の別荘' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa?tab=tasks'
    );
  });

  it('人物を選ぶとすぐにひもづけ、外すボタンですぐに外す', async () => {
    const user = userEvent.setup();
    render(<TaskDetail taskId="task-caretaker" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '対象の人物を追加' }), 'person-owner');
    expect(findTask('task-caretaker').personIds).toEqual(['person-caretaker', 'person-owner']);

    await user.click(screen.getByRole('button', { name: '「管理人」を対象の人物から外す' }));
    expect(findTask('task-caretaker').personIds).toEqual(['person-owner']);
  });

  it('既にひもづけた場所は、追加の選択肢に並べない', () => {
    render(<TaskDetail taskId="task-caretaker" />);

    // 前提: サンプルのケースの場所は湖畔の別荘だけで、既にひもづけている
    expect(screen.getByRole('combobox', { name: '対象の場所を追加' })).toBeDisabled();
  });
});

describe('TaskDetail（結果を証言として書き足す）', () => {
  it('書き足した証言を保存し、この未了事項の対象の証言にひもづける', async () => {
    const user = userEvent.setup();
    render(<TaskDetail taskId="task-caretaker" />);

    await user.click(screen.getByRole('button', { name: '結果を証言として書き足す' }));
    const appendButton = screen.getByRole('region', { name: '結果の証言の書き足し' });
    await user.type(within(appendButton).getByLabelText('内容'), '見回りは22時ごろだったと訂正した。');
    await user.click(within(appendButton).getByRole('button', { name: '書き足す' }));

    const appendedClaim = openedCase().claims.at(-1);
    expect(appendedClaim?.content).toBe('見回りは22時ごろだったと訂正した。');
    expect(findTask('task-caretaker').claimIds).toEqual(['claim-caretaker', appendedClaim?.id]);
    expect(screen.queryByRole('region', { name: '結果の証言の書き足し' })).not.toBeInTheDocument();
  });
});

describe('NewTaskDetail（未了事項の登録）', () => {
  it('内容を入力して保存すると、未着手の未了事項を登録し、その詳細へ移る', async () => {
    resetMockNavigation('/cases/case-lakeside/tasks/new?tab=tasks');
    const user = userEvent.setup();
    render(<NewTaskDetail />);

    await user.type(screen.getByRole('textbox', { name: '内容' }), '朝刊の記事の原典を探す');
    await user.click(screen.getByRole('button', { name: '未了事項を保存' }));

    const registeredTask = openedCase().tasks.at(-1);
    expect(registeredTask).toMatchObject({
      content: '朝刊の記事の原典を探す',
      status: 'todo',
      claimIds: [],
      personIds: [],
      placeIds: [],
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/tasks/${registeredTask?.id}?tab=tasks`);
  });

  it('URLで指定した証言を、最初からひもづけて登録する', async () => {
    resetMockNavigation('/cases/case-lakeside/tasks/new?link=claim%3Aclaim-report');
    const user = userEvent.setup();
    render(<NewTaskDetail />);

    expect(screen.getByText(/架空日報/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '内容' }), '朝刊の記事の原典を探す');
    await user.click(screen.getByRole('button', { name: '未了事項を保存' }));

    expect(openedCase().tasks.at(-1)?.claimIds).toEqual(['claim-report']);
  });

  it('URLで指定した対象がケースに無い場合は、ひもづけずに登録する', async () => {
    // 前提: URLはユーザーが自由に書き換えられるため、存在しない対象でも登録の画面を開ける
    resetMockNavigation('/cases/case-lakeside/tasks/new?link=person%3Aperson-gone');
    const user = userEvent.setup();
    render(<NewTaskDetail />);

    await user.type(screen.getByRole('textbox', { name: '内容' }), '謎の来訪者を探す');
    await user.click(screen.getByRole('button', { name: '未了事項を保存' }));

    expect(openedCase().tasks.at(-1)?.personIds).toEqual([]);
  });
});
