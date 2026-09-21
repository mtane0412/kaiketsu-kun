/**
 * 座標の入力欄（住所・地名の検索、地図のクリック、座標の削除）のテスト
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCoordinates } from '@/lib/geocoding';
import type { Coordinates } from '@/domain/types';
import { CoordinateField } from './CoordinateField';

// 住所検索APIは外部のサービスのため、差し替える（検索そのものは geocoding.test.ts で検証する）
vi.mock('@/lib/geocoding', () => ({ searchCoordinates: vi.fn() }));

/** 地図（差し替え）をクリックしたときに選ばれる地点です。 */
const 湖のほとり = { latitude: 35.5, longitude: 138.75 };

// jsdom は地図を描画できないため、ピンの位置を文字で示し、ボタンで地点を選ぶ部品に差し替える
vi.mock('./CoordinateMap', () => ({
  default: function CoordinateMapStub({ value, onPick }: { value: Coordinates | undefined; onPick: (picked: Coordinates) => void }) {
    return (
      <div>
        <p>ピンの位置: {value ? `${value.latitude},${value.longitude}` : 'なし'}</p>
        <button type="button" onClick={() => onPick(湖のほとり)}>
          地図をクリック
        </button>
      </div>
    );
  },
}));

const 永田町 = { title: '東京都千代田区永田町一丁目７番', latitude: 35.677414, longitude: 139.744382 };
const 永田町二丁目 = { title: '東京都千代田区永田町二丁目', latitude: 35.675, longitude: 139.741 };

/** 入力欄の値を保持する親です。onChange で受け取った値を、画面と onChange の記録の両方で確認できます。 */
function 座標の入力欄({ initial, onChange }: { initial?: Coordinates; onChange: (value: Coordinates | undefined) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <CoordinateField
      label="座標"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

beforeEach(() => {
  vi.mocked(searchCoordinates).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CoordinateField', () => {
  it('住所を検索して候補を選ぶと、その座標を登録し、地図のピンと表示に反映する', async () => {
    vi.mocked(searchCoordinates).mockResolvedValue([永田町, 永田町二丁目]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<座標の入力欄 onChange={onChange} />);

    await user.type(screen.getByLabelText('住所・地名で検索'), '永田町');
    await user.click(screen.getByRole('button', { name: '検索' }));
    const 候補 = await screen.findByRole('list', { name: '座標の候補' });
    await user.click(within(候補).getByRole('button', { name: '東京都千代田区永田町一丁目７番' }));

    expect(searchCoordinates).toHaveBeenCalledWith('永田町');
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 35.677414, longitude: 139.744382 });
    expect(await screen.findByText('ピンの位置: 35.677414,139.744382')).toBeInTheDocument();
    expect(screen.getByText('緯度 35.67741・経度 139.74438')).toBeInTheDocument();
    // 検証: 候補を選んだ後は、候補の一覧を閉じる
    expect(screen.queryByRole('list', { name: '座標の候補' })).not.toBeInTheDocument();
  });

  it('検索欄で Enter を押すと検索し、フォームは送信しない', async () => {
    vi.mocked(searchCoordinates).mockResolvedValue([永田町]);
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <座標の入力欄 onChange={vi.fn()} />
      </form>,
    );

    await user.type(screen.getByLabelText('住所・地名で検索'), '永田町{Enter}');

    expect(await screen.findByRole('list', { name: '座標の候補' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('日本語入力の変換を確定する Enter では、検索しない', () => {
    render(<座標の入力欄 onChange={vi.fn()} />);

    const 検索欄 = screen.getByLabelText('住所・地名で検索');
    検索欄.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));

    expect(searchCoordinates).not.toHaveBeenCalled();
  });

  it('候補が無い場合は、地図で決めるよう案内する', async () => {
    vi.mocked(searchCoordinates).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<座標の入力欄 onChange={vi.fn()} />);

    await user.type(screen.getByLabelText('住所・地名で検索'), '湖畔の別荘');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(await screen.findByText('候補が見つかりませんでした。地図をクリックして座標を決めてください。')).toBeInTheDocument();
  });

  it('検索に失敗した場合は、理由を表示する', async () => {
    vi.mocked(searchCoordinates).mockRejectedValue(new Error('住所を検索できませんでした（通信に失敗しました）'));
    const user = userEvent.setup();
    render(<座標の入力欄 onChange={vi.fn()} />);

    await user.type(screen.getByLabelText('住所・地名で検索'), '永田町');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('住所を検索できませんでした（通信に失敗しました）');
  });

  it('地図をクリックすると、その地点の座標を登録する（住所の無い場所のため）', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<座標の入力欄 onChange={onChange} />);

    await user.click(await screen.findByRole('button', { name: '地図をクリック' }));

    expect(onChange).toHaveBeenLastCalledWith(湖のほとり);
    expect(screen.getByText('緯度 35.50000・経度 138.75000')).toBeInTheDocument();
  });

  it('座標が無い場合は、未設定と表示し、削除のボタンを出さない', () => {
    render(<座標の入力欄 onChange={vi.fn()} />);

    expect(screen.getByText('座標は未設定です。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '座標を削除' })).not.toBeInTheDocument();
  });

  it('「座標を削除」を押すと、登録済みの座標を取り除く', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<座標の入力欄 initial={湖のほとり} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: '座標を削除' }));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText('座標は未設定です。')).toBeInTheDocument();
  });
});
