/**
 * 削除の確認ボタンのテスト
 *
 * 削除は取り消せないため、押してすぐには消さず、確認の画面で改めて承認を求めます。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteConfirmButton } from './DeleteConfirmButton';

/** 「隣家の住人」を削除する確認ボタンを描画します。 */
function 確認ボタンを描画する(onConfirm: () => void) {
  render(
    <DeleteConfirmButton
      label="この人物を削除"
      title="「隣家の住人」を削除しますか？"
      description="この人物を削除します。この操作は取り消せません。"
      onConfirm={onConfirm}
    />
  );
}

describe('DeleteConfirmButton', () => {
  it('押しただけでは削除せず、確認の画面を開く', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    確認ボタンを描画する(onConfirm);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));

    expect(await screen.findByText('「隣家の住人」を削除しますか？')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('確認の画面で承認すると、削除を実行する', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    確認ボタンを描画する(onConfirm);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('承認したあとは、確認の画面を閉じる', async () => {
    const user = userEvent.setup();
    確認ボタンを描画する(vi.fn());

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    // 検証: 閉じないと、削除できなかった理由など、後ろの画面の表示が読めない
    await waitFor(() => expect(screen.queryByText('「隣家の住人」を削除しますか？')).not.toBeInTheDocument());
  });

  it('確認の画面でやめると、削除を実行しない', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    確認ボタンを描画する(onConfirm);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));
    await user.click(await screen.findByRole('button', { name: 'やめる' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
