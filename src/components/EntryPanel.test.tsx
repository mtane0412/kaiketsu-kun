/**
 * 入力パネル（種類の切り替え・新規登録・編集・削除）のテスト
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { CropperProps } from 'react-easy-crop';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { fileToResizedDataUrl } from '@/lib/image-utils';
import { useCaseStore } from '@/stores/useCaseStore';
import { EntryPanel } from './EntryPanel';

// jsdom は画像のデコードと canvas の描画を持たないため、画像の縮小は差し替える（縮小そのものは image-utils.test.ts で検証する）
vi.mock('@/lib/image-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image-utils')>()),
  fileToResizedDataUrl: vi.fn(),
}));

/** 切り抜きの画面（差し替え）が決める、切り抜き範囲です（単位は元の画像のピクセル）。 */
const 顔の周り = { x: 100, y: 50, width: 512, height: 512 };

// jsdom は要素の大きさを持たず、切り抜きのライブラリは範囲を計算できないため、
// 表示した時点で「顔の周り」を切り抜き範囲として通知する部品に差し替える
vi.mock('react-easy-crop', () => ({
  default: function CropperStub({ image, mediaProps, cropShape, onCropAreaChange }: Partial<CropperProps>) {
    useEffect(() => {
      onCropAreaChange?.({ x: 10, y: 5, width: 50, height: 50 }, 顔の周り);
    }, [onCropAreaChange]);
    return <img src={image} alt="切り抜く画像" data-crop-shape={cropShape} onError={mediaProps?.onError} />;
  },
}));

/** 地図（差し替え）をクリックしたときに選ばれる地点です。 */
const 湖のほとり = { latitude: 35.5, longitude: 138.75 };

// jsdom は地図を描画できないため、ボタンで地点を選ぶ部品に差し替える（座標欄そのものは CoordinateField.test.tsx で検証する）
vi.mock('./forms/CoordinateMap', () => ({
  default: function CoordinateMapStub({ onPick }: { onPick: (picked: { latitude: number; longitude: number }) => void }) {
    return (
      <button type="button" onClick={() => onPick(湖のほとり)}>
        地図をクリック
      </button>
    );
  },
}));

beforeEach(() => {
  useCaseStore.getState().replaceCase(sampleFictionalCase);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it('人物にアイコンの文字を指定すると、先頭の1文字を保存し、登録済みの一覧のアイコンにする', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.type(screen.getByLabelText('名前'), '郵便配達員');
    // 2文字入力しても、アイコンに入るのは1文字のため、先頭の1文字だけを保存する
    await user.type(screen.getByLabelText(/アイコンの文字/), '〒便');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(useCaseStore.getState().currentCase.persons.at(-1)).toMatchObject({ name: '郵便配達員', iconText: '〒' });
    const 配達員の行 = within(screen.getByRole('list', { name: '登録済みの人物' })).getByText('郵便配達員').closest('li');
    // 文字は CSS で描画するため、要素の中身ではなく data-icon-text 属性に入っている
    expect(配達員の行?.querySelector('[data-icon-text]')).toHaveAttribute('data-icon-text', '〒');
  });

  it('アイコンの文字を指定しない人物は、アイコンの文字を保存せず、名前の先頭の文字を一覧のアイコンにする', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.type(screen.getByLabelText('名前'), '郵便配達員');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(useCaseStore.getState().currentCase.persons.at(-1)).not.toHaveProperty('iconText');
    const 配達員の行 = within(screen.getByRole('list', { name: '登録済みの人物' })).getByText('郵便配達員').closest('li');
    expect(配達員の行?.querySelector('[data-icon-text]')).toHaveAttribute('data-icon-text', '郵');
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
    const 管理人の証言 = within(一覧).getByText(/見回りをしたとき/).closest('li')!;
    expect(管理人の証言).toHaveTextContent('管理人（湖畔の夏 20年目の証言（架空の書籍） による）');
    const 防犯カメラの記録 = within(一覧).getByText(/車が別荘の方向へ走る/).closest('li')!;
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
    expect(within(一覧).queryByText(/明かりがついていて/)).not.toBeInTheDocument();
  });

  it('登録済みの証言の編集を選ぶと、フォームに内容を読み込み、取り消しで新規登録に戻る', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.click(screen.getByRole('tab', { name: /証言/ }));
    await user.click(screen.getByRole('button', { name: /見回りをしたとき.*を編集/ }));

    expect(screen.getByLabelText('内容')).toHaveValue(
      '@1998年8月12日 19:00に見回りをしたとき、@湖畔の別荘はすでに真っ暗で、@別荘の持ち主の車も無かった。'
    );

    // 検証: 発言者と経由は本文ではなく「発言者」に読み込む
    expect(
      screen.getByRole('button', { name: '発言者: 管理人（湖畔の夏 20年目の証言（架空の書籍） による）' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '編集を取り消す' }));

    expect(screen.getByLabelText('内容')).toHaveValue('');
  });
});

describe('EntryPanel（エンティティの画像）', () => {
  const 縮小済みの画像 = 'data:image/jpeg;base64,AAAA';
  const 顔写真 = new File(['画像の中身'], '顔写真.png', { type: 'image/png' });

  /** 画像を選んでから「この範囲で登録」を押すまでの操作です。 */
  const 切り抜いて登録する = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByRole('img', { name: '切り抜く画像' });
    await user.click(screen.getByRole('button', { name: 'この範囲で登録' }));
  };

  beforeEach(() => {
    vi.mocked(fileToResizedDataUrl).mockReset();
    vi.mocked(fileToResizedDataUrl).mockResolvedValue(縮小済みの画像);
    // jsdom は Blob の URL を発行できないため、差し替える
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:顔写真'), revokeObjectURL: vi.fn() }));
  });

  it('人物に画像を登録すると、切り抜いて縮小した画像を保存し、登録済みの一覧に表示する', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.type(screen.getByLabelText('名前'), '郵便配達員');
    await user.upload(screen.getByLabelText('画像'), 顔写真);
    await 切り抜いて登録する(user);
    expect(await screen.findByRole('img', { name: '登録する画像' })).toHaveAttribute('src', 縮小済みの画像);
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    // 検証: 切り抜きの画面で決めた範囲を、縮小の処理に渡している
    expect(fileToResizedDataUrl).toHaveBeenCalledWith(顔写真, 顔の周り);
    expect(useCaseStore.getState().currentCase.persons.at(-1)).toMatchObject({ name: '郵便配達員', imageDataUrl: 縮小済みの画像 });
    const 配達員の行 = within(screen.getByRole('list', { name: '登録済みの人物' })).getByText('郵便配達員').closest('li');
    expect(配達員の行?.querySelector('img')).toHaveAttribute('src', 縮小済みの画像);
  });

  it('場所にも画像を登録できる', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'places', id: 'place-villa' }} />);

    await user.upload(screen.getByLabelText('画像'), 顔写真);
    await 切り抜いて登録する(user);
    await screen.findByRole('img', { name: '登録する画像' });
    await user.click(screen.getByRole('button', { name: '場所を保存' }));

    expect(useCaseStore.getState().currentCase.places.find((place) => place.id === 'place-villa')).toMatchObject({
      name: '湖畔の別荘',
      imageDataUrl: 縮小済みの画像,
    });
  });

  it('人物の画像は丸く切り抜き、丸く表示する（アバター）', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.upload(screen.getByLabelText('画像'), 顔写真);
    expect(await screen.findByRole('img', { name: '切り抜く画像' })).toHaveAttribute('data-crop-shape', 'round');
    await 切り抜いて登録する(user);

    expect((await screen.findByRole('img', { name: '登録する画像' })).parentElement).toHaveClass('rounded-full');
  });

  it('場所の画像は四角く切り抜き、四角く表示する（場所の写真はアバターではない）', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'places', id: 'place-villa' }} />);

    await user.upload(screen.getByLabelText('画像'), 顔写真);
    expect(await screen.findByRole('img', { name: '切り抜く画像' })).toHaveAttribute('data-crop-shape', 'rect');
    await 切り抜いて登録する(user);

    expect((await screen.findByRole('img', { name: '登録する画像' })).parentElement).not.toHaveClass('rounded-full');
  });

  it('「画像を選ぶ」を押すと、ファイルの選択を開く', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);
    const click = vi.spyOn(screen.getByLabelText<HTMLInputElement>('画像'), 'click');

    await user.click(screen.getByRole('button', { name: '画像を選ぶ' }));

    expect(click).toHaveBeenCalled();
  });

  it('切り抜きをキャンセルすると、画像を登録しない', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.upload(screen.getByLabelText('画像'), 顔写真);
    await screen.findByRole('img', { name: '切り抜く画像' });
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByRole('img', { name: '切り抜く画像' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '登録する画像' })).not.toBeInTheDocument();
    expect(fileToResizedDataUrl).not.toHaveBeenCalled();
  });

  it('画像をキーボードで貼り付けると、その画像の切り抜きを始める', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    // スクリーンショットをコピーして、Ctrl+V / ⌘+V で貼り付けた場合
    fireEvent.paste(document, { clipboardData: { files: [顔写真] } });
    await 切り抜いて登録する(user);

    expect(fileToResizedDataUrl).toHaveBeenCalledWith(顔写真, 顔の周り);
    expect(await screen.findByRole('img', { name: '登録する画像' })).toHaveAttribute('src', 縮小済みの画像);
  });

  it('文字だけの貼り付けでは、切り抜きを始めない', () => {
    render(<EntryPanel />);

    fireEvent.paste(document, { clipboardData: { files: [] } });

    expect(screen.queryByRole('img', { name: '切り抜く画像' })).not.toBeInTheDocument();
  });

  it('「クリップボードから貼り付け」を押すと、クリップボードの画像の切り抜きを始める', async () => {
    const user = userEvent.setup();
    // 前提: クリップボードにはPNGの画像が入っている（user-event が用意する navigator.clipboard を差し替える）
    const コピーした画像 = new Blob(['画像の中身'], { type: 'image/png' });
    vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([
      { types: ['text/html', 'image/png'], getType: vi.fn().mockResolvedValue(コピーした画像) } as unknown as ClipboardItem,
    ]);
    render(<EntryPanel />);

    await user.click(screen.getByRole('button', { name: 'クリップボードから貼り付け' }));
    await 切り抜いて登録する(user);

    expect(fileToResizedDataUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }), 顔の周り);
    expect(await screen.findByRole('img', { name: '登録する画像' })).toHaveAttribute('src', 縮小済みの画像);
  });

  it('クリップボードに画像が無い場合は、理由を表示する', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([
      { types: ['text/plain'], getType: vi.fn() } as unknown as ClipboardItem,
    ]);
    render(<EntryPanel />);

    await user.click(screen.getByRole('button', { name: 'クリップボードから貼り付け' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('クリップボードに画像がありません');
  });

  it('クリップボードを読み取れない場合は、理由を表示する', async () => {
    const user = userEvent.setup();
    // ブラウザの設定で、クリップボードの読み取りを拒否した場合
    vi.spyOn(navigator.clipboard, 'read').mockRejectedValue(new Error('Read permission denied.'));
    render(<EntryPanel />);

    await user.click(screen.getByRole('button', { name: 'クリップボードから貼り付け' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('クリップボードを読み取れませんでした');
  });

  it('編集で「画像を削除」を選んで保存すると、登録済みの画像を取り除く', async () => {
    // 前提: 管理人には画像を登録してある
    useCaseStore.getState().upsert('persons', { id: 'person-caretaker', name: '管理人', imageDataUrl: 縮小済みの画像 });
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    expect(screen.getByRole('img', { name: '登録する画像' })).toHaveAttribute('src', 縮小済みの画像);
    await user.click(screen.getByRole('button', { name: '画像を削除' }));
    expect(screen.queryByRole('img', { name: '登録する画像' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    const 管理人 = useCaseStore.getState().currentCase.persons.find((person) => person.id === 'person-caretaker');
    expect(管理人).not.toHaveProperty('imageDataUrl');
  });

  it('画像を変更せずに保存すると、登録済みの画像を引き継ぐ', async () => {
    useCaseStore.getState().upsert('persons', { id: 'person-caretaker', name: '管理人', imageDataUrl: 縮小済みの画像 });
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    const 管理人 = useCaseStore.getState().currentCase.persons.find((person) => person.id === 'person-caretaker');
    expect(管理人?.imageDataUrl).toBe(縮小済みの画像);
  });

  it('画像でないファイルを選んだ場合は、理由を表示し、切り抜きを始めない', async () => {
    // accept 属性による絞り込みを外し、画像でないファイルを選べた場合を再現する
    const user = userEvent.setup({ applyAccept: false });
    render(<EntryPanel />);

    await user.upload(screen.getByLabelText('画像'), new File(['本文'], 'メモ.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('画像ファイルを選んでください');
    expect(screen.queryByRole('img', { name: '切り抜く画像' })).not.toBeInTheDocument();
  });

  it('切り抜きの画面で画像を表示できない場合は、理由を表示し、切り抜きをやめる', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.upload(screen.getByLabelText('画像'), 顔写真);
    // 拡張子は画像でも中身が壊れているファイルは、ブラウザが表示に失敗する
    fireEvent.error(await screen.findByRole('img', { name: '切り抜く画像' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('画像を読み込めませんでした');
    expect(screen.queryByRole('img', { name: '切り抜く画像' })).not.toBeInTheDocument();
  });

  it('縮小に失敗した場合は、理由を表示し、画像を登録しない', async () => {
    vi.mocked(fileToResizedDataUrl).mockRejectedValue(new Error('画像を読み込めませんでした。別の画像ファイルを選んでください'));
    const user = userEvent.setup();
    render(<EntryPanel />);

    await user.upload(screen.getByLabelText('画像'), 顔写真);
    await 切り抜いて登録する(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('画像を読み込めませんでした');
    expect(screen.queryByRole('img', { name: '登録する画像' })).not.toBeInTheDocument();
  });
});

describe('EntryPanel（メモのメンションと、関連するエンティティ）', () => {
  /** メモ欄に文字列を入力し、表示された候補から名前が一致するものを選びます。 */
  async function typeNoteAndChoose(user: ReturnType<typeof userEvent.setup>, text: string, optionName: string) {
    await user.type(screen.getByLabelText('メモ'), text);
    await user.click(screen.getByRole('option', { name: optionName }));
  }

  /** 持ち主のメモが管理人と別荘に触れている案件を読み込みます。 */
  function loadCaseWithOwnerNote() {
    useCaseStore.getState().replaceCase({
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner'
          ? {
              ...person,
              note: '@[管理人さん](person:person-caretaker)を雇い、@[湖畔の別荘](place:place-villa)の手入れを任せていた。',
            }
          : person
      ),
    });
  }

  it('人物のメモで「@」から登録済みのエンティティを選ぶと、メンションとして保存する', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    await typeNoteAndChoose(user, '@湖畔', '場所 湖畔の別荘');
    await user.type(screen.getByLabelText('メモ'), 'の鍵を預かっていた。');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    const 管理人 = useCaseStore.getState().currentCase.persons.find((person) => person.id === 'person-caretaker');
    expect(管理人?.note).toBe('@[湖畔の別荘](place:place-villa)の鍵を預かっていた。');
  });

  it('場所のメモでも、メンションを保存できる', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'places', id: 'place-villa' }} />);

    await typeNoteAndChoose(user, '@持ち主', '人物 別荘の持ち主');
    await user.type(screen.getByLabelText('メモ'), 'が1990年に建てた。');
    await user.click(screen.getByRole('button', { name: '場所を保存' }));

    expect(useCaseStore.getState().currentCase.places[0]?.note).toBe(
      '@[別荘の持ち主](person:person-owner)が1990年に建てた。'
    );
  });

  it('メモで未登録の名前を新規作成すると、編集中のエンティティと同時に保存する', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    await typeNoteAndChoose(user, '@湖畔駅', '「湖畔駅」を場所として新規作成');
    await user.type(screen.getByLabelText('メモ'), 'の近くに住んでいる。');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    const { persons, places } = useCaseStore.getState().currentCase;
    const 湖畔駅 = places.find((place) => place.name === '湖畔駅');
    expect(湖畔駅).toBeDefined();
    expect(persons.find((person) => person.id === 'person-caretaker')?.note).toBe(
      `@[湖畔駅](place:${湖畔駅?.id})の近くに住んでいる。`
    );
  });

  it('新規作成した名前をメモから消した場合は、そのエンティティを保存しない', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    await typeNoteAndChoose(user, '@湖畔駅', '「湖畔駅」を場所として新規作成');
    await user.clear(screen.getByLabelText('メモ'));
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(useCaseStore.getState().currentCase.places.map((place) => place.name)).toEqual(['湖畔の別荘']);
  });

  it('編集を開くと、メモのメンションをエンティティの現在の名前で表示し、そのまま保存してもメンションを保つ', async () => {
    // 前提: トークンに控えた表示名「管理人さん」は古く、エンティティの現在の名前は「管理人」である
    loadCaseWithOwnerNote();
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-owner' }} />);

    expect(screen.getByLabelText('メモ')).toHaveValue('@管理人を雇い、@湖畔の別荘の手入れを任せていた。');

    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    const 持ち主 = useCaseStore.getState().currentCase.persons.find((person) => person.id === 'person-owner');
    expect(持ち主?.note).toBe(
      '@[管理人](person:person-caretaker)を雇い、@[湖畔の別荘](place:place-villa)の手入れを任せていた。'
    );
  });

  it('メモの候補に、編集中のエンティティ自身は出さない', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    await user.type(screen.getByLabelText('メモ'), '@管理');

    expect(screen.queryByRole('option', { name: '人物 管理人' })).not.toBeInTheDocument();
  });

  it('編集中のエンティティに関連するエンティティを、種類と関連の向きを添えて一覧に表示する', () => {
    loadCaseWithOwnerNote();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-caretaker' }} />);

    const 関連 = within(screen.getByRole('list', { name: '関連するエンティティ' })).getAllByRole('listitem');

    // 管理人のメモには何も書かれていないが、持ち主のメモが管理人に触れている
    expect(関連).toHaveLength(1);
    expect(関連[0]).toHaveTextContent('人物');
    expect(関連[0]).toHaveTextContent('別荘の持ち主');
    expect(関連[0]).toHaveTextContent('メモで言及されています');
  });

  it('関連するエンティティを選ぶと、そのエンティティの編集に切り替える', async () => {
    loadCaseWithOwnerNote();
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'persons', id: 'person-owner' }} />);

    await user.click(screen.getByRole('button', { name: /湖畔の別荘/ }));

    expect(screen.getByRole('tab', { name: /場所/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '場所を編集' })).toBeInTheDocument();
    expect(screen.getByLabelText('名前')).toHaveValue('湖畔の別荘');
    // 別荘から見ると、持ち主が関連するエンティティになる
    expect(
      within(screen.getByRole('list', { name: '関連するエンティティ' })).getByRole('button', { name: /別荘の持ち主/ })
    ).toBeInTheDocument();
  });

  it('関連するエンティティが無い場合は、メモの「@」で関連付けられることを案内する', () => {
    render(<EntryPanel initial={{ key: 'persons', id: 'person-police' }} />);

    expect(screen.getByRole('heading', { name: '関連するエンティティ' })).toBeInTheDocument();
    expect(screen.getByText('メモで「@」を入力すると、他の人物・場所と関連付けられます。')).toBeInTheDocument();
  });

  it('新規登録と証言の編集では、関連するエンティティの領域を表示しない', async () => {
    const user = userEvent.setup();
    render(<EntryPanel />);

    expect(screen.queryByRole('heading', { name: '関連するエンティティ' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /証言/ }));
    await user.click(screen.getAllByRole('button', { name: /を編集$/ })[0]!);

    expect(screen.queryByRole('heading', { name: '関連するエンティティ' })).not.toBeInTheDocument();
  });
});

describe('EntryPanel（場所の座標）', () => {
  const 別荘 = () => useCaseStore.getState().currentCase.places.find((place) => place.id === 'place-villa');

  it('場所のフォームで地図から地点を選んで保存すると、緯度と経度を保存する', async () => {
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'places', id: 'place-villa' }} />);

    await user.click(await screen.findByRole('button', { name: '地図をクリック' }));
    await user.click(screen.getByRole('button', { name: '場所を保存' }));

    expect(別荘()).toMatchObject({ name: '湖畔の別荘', latitude: 35.5, longitude: 138.75 });
  });

  it('座標を変更せずに保存すると、登録済みの座標を引き継ぐ', async () => {
    // 前提: 別荘には座標を登録してある
    useCaseStore.getState().upsert('places', { id: 'place-villa', name: '湖畔の別荘', ...湖のほとり });
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'places', id: 'place-villa' }} />);

    expect(screen.getByText('緯度 35.50000・経度 138.75000')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '場所を保存' }));

    expect(別荘()).toMatchObject(湖のほとり);
  });

  it('編集で「座標を削除」を選んで保存すると、登録済みの座標を取り除く', async () => {
    useCaseStore.getState().upsert('places', { id: 'place-villa', name: '湖畔の別荘', ...湖のほとり });
    const user = userEvent.setup();
    render(<EntryPanel initial={{ key: 'places', id: 'place-villa' }} />);

    await user.click(screen.getByRole('button', { name: '座標を削除' }));
    await user.click(screen.getByRole('button', { name: '場所を保存' }));

    expect(別荘()).not.toHaveProperty('latitude');
    expect(別荘()).not.toHaveProperty('longitude');
  });

  it('人物のフォームには、座標の欄を出さない', () => {
    render(<EntryPanel />);

    expect(screen.queryByRole('group', { name: '座標' })).not.toBeInTheDocument();
  });
});
