/**
 * 日時のピッカーのテスト
 *
 * ピッカーが、日や時刻を選んだだけでは確定せず、「決定」を押したときにだけ値を返すことを検証します。
 * 以前はブラウザの日時入力欄（input[type=date] など）を使っており、値がそろった瞬間に確定していたため、
 * 日付を選んだ直後に閉じてしまい、時刻を選べませんでした。その再発を防ぐためのテストを含みます。
 */
import type { FormEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTimePicker } from './DateTimePicker';

/** 表示する年月を、指定の年月に切り替えます。 */
async function showMonth(user: UserEvent, year: number, month: number) {
  const 年の欄 = screen.getByLabelText('年');
  await user.clear(年の欄);
  await user.type(年の欄, String(year));
  await user.selectOptions(screen.getByLabelText('月'), String(month));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DateTimePicker', () => {
  it('日付のピッカーで日を選び「決定」を押すと、時刻を含まない時刻参照を返す', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DateTimePicker kind="date" onSelect={onSelect} onCancel={vi.fn()} />);

    await showMonth(user, 1998, 8);
    await user.click(screen.getByRole('button', { name: '1998年8月12日' }));
    await user.click(screen.getByRole('button', { name: '決定' }));

    expect(onSelect).toHaveBeenCalledWith('1998-08-12');
  });

  it('日時のピッカーで日と時刻を選び「決定」を押すと、分までの時刻参照を返す', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DateTimePicker kind="datetime" onSelect={onSelect} onCancel={vi.fn()} />);

    await showMonth(user, 1998, 8);
    await user.click(screen.getByRole('button', { name: '1998年8月12日' }));
    await user.selectOptions(screen.getByLabelText('時'), '19');
    await user.selectOptions(screen.getByLabelText('分'), '5');
    await user.click(screen.getByRole('button', { name: '決定' }));

    expect(onSelect).toHaveBeenCalledWith('1998-08-12T19:05');
  });

  it('日を選んだだけでは確定せず、時刻を選び直してから決定できる（ピッカーが即座に閉じない）', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DateTimePicker kind="datetime" onSelect={onSelect} onCancel={vi.fn()} />);

    await showMonth(user, 1998, 8);
    await user.click(screen.getByRole('button', { name: '1998年8月12日' }));

    // 日を選んだ時点では値を返さない（ここで確定していたため、時刻を選べなかった）
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '1998年8月13日' }));
    await user.selectOptions(screen.getByLabelText('時'), '19');
    await user.click(screen.getByRole('button', { name: '決定' }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('1998-08-13T19:00');
  });

  it('日を選ぶまでは「決定」を押せない', async () => {
    const user = userEvent.setup();
    render(<DateTimePicker kind="date" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: '決定' })).toBeDisabled();

    await showMonth(user, 1998, 8);
    await user.click(screen.getByRole('button', { name: '1998年8月12日' }));

    expect(screen.getByRole('button', { name: '決定' })).toBeEnabled();
  });

  it('「キャンセル」を押すと、値を返さずに閉じることを伝える', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    render(<DateTimePicker kind="date" onSelect={onSelect} onCancel={onCancel} />);

    await showMonth(user, 1998, 8);
    await user.click(screen.getByRole('button', { name: '1998年8月12日' }));
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escapeキーを押すと、値を返さずに閉じることを伝える', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    render(<DateTimePicker kind="date" onSelect={onSelect} onCancel={onCancel} />);

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Enterキーで決定でき、外側のフォームを送信しない（ピッカーは証言のフォームの中で開くため）', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <DateTimePicker kind="date" onSelect={onSelect} onCancel={vi.fn()} />
      </form>
    );

    await showMonth(user, 1998, 8);
    await user.click(screen.getByRole('button', { name: '1998年8月12日' }));
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('1998-08-12');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('日を選ぶ前のEnterキーでは、何も確定せずフォームも送信しない', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <DateTimePicker kind="date" onSelect={onSelect} onCancel={vi.fn()} />
      </form>
    );

    await user.keyboard('{Enter}');

    expect(onSelect).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('前の月・次の月のボタンで、表示する年月を移せる', async () => {
    const user = userEvent.setup();
    render(<DateTimePicker kind="date" onSelect={vi.fn()} onCancel={vi.fn()} />);

    await showMonth(user, 1998, 1);
    await user.click(screen.getByRole('button', { name: '前の月' }));

    expect(screen.getByLabelText('年')).toHaveValue(1997);
    expect(screen.getByLabelText('月')).toHaveValue('12');

    await user.click(screen.getByRole('button', { name: '次の月' }));

    expect(screen.getByLabelText('年')).toHaveValue(1998);
    expect(screen.getByLabelText('月')).toHaveValue('1');
  });

  it('その月に実在する日だけを並べる（1998年2月は28日まで）', async () => {
    const user = userEvent.setup();
    render(<DateTimePicker kind="date" onSelect={vi.fn()} onCancel={vi.fn()} />);

    await showMonth(user, 1998, 2);

    expect(screen.getByRole('button', { name: '1998年2月28日' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1998年2月29日' })).not.toBeInTheDocument();
  });

  it('最初は今日の年月を表示する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00'));
    render(<DateTimePicker kind="date" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('年')).toHaveValue(2026);
    expect(screen.getByLabelText('月')).toHaveValue('9');
  });

  it('日を選んだ後に別の月へ移ると、その月に無い日の選択を解除する', async () => {
    const user = userEvent.setup();
    render(<DateTimePicker kind="date" onSelect={vi.fn()} onCancel={vi.fn()} />);

    await showMonth(user, 1998, 1);
    await user.click(screen.getByRole('button', { name: '1998年1月31日' }));
    await user.selectOptions(screen.getByLabelText('月'), '2');

    // 1998年2月31日は存在しないため、選択を解除して決定できない状態に戻す
    expect(screen.getByRole('button', { name: '決定' })).toBeDisabled();
  });
});
