/**
 * 地図ビュー（時系列の並び順を地図上でたどる表示）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapPin } from '@/domain/case-views';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { resetMockNavigation } from '@/test/mock-navigation';
import { MapView } from './MapView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  // 証言のカードは、リンク先のURLの組み立てにケースのIDをURLから読み取るため、ケースのボードのURLから始める
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

// jsdom は地図を描画できないため、ピンと選択中の番号を文字で示し、ボタンでピンを選ぶ部品に差し替える
vi.mock('./TrailMap', () => ({
  default: function TrailMapStub({
    pins,
    activeOrder,
    onSelectPin,
  }: {
    pins: MapPin[];
    activeOrder: number;
    onSelectPin: (pin: MapPin) => void;
  }) {
    return (
      <div>
        <p>地図で選択中の番号: {activeOrder}</p>
        {pins.map((pin) => (
          <button key={pin.place.id} type="button" onClick={() => onSelectPin(pin)}>
            ピン: {pin.place.name}（{pin.orders.join('・')}）
          </button>
        ))}
      </div>
    );
  },
}));

/**
 * 2つの場所に座標を登録したケースです。
 * 時系列の並び順は 管理人（湖畔の別荘）→ 防犯カメラ（県道の交差点）→ 隣家（湖畔の別荘）→ 架空日報（場所なし）→ 推測（場所なし）です。
 */
const 座標を登録したケース: Case = {
  ...sampleFictionalCase,
  places: [
    { id: 'place-villa', name: '湖畔の別荘', latitude: 35.5, longitude: 138.75 },
    { id: 'place-crossing', name: '県道の交差点', latitude: 35.51, longitude: 138.76 },
  ],
  claims: sampleFictionalCase.claims.map((claim) =>
    claim.id === 'claim-police-camera' ? { ...claim, placeId: 'place-crossing' } : claim
  ),
};

/** 選択中の証言を表示する欄を返します。 */
function 選択中の証言() {
  return within(screen.getByRole('list', { name: '選択中の証言' }));
}

describe('MapView', () => {
  it('最初は時系列の1番目の地点を選び、場所ごとにまとめたピンを地図に渡す', async () => {
    render(<MapView target={座標を登録したケース} />);

    expect(await screen.findByText('地図で選択中の番号: 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ピン: 湖畔の別荘（1・3）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ピン: 県道の交差点（2）' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
    expect(選択中の証言().getByText('管理人')).toBeInTheDocument();
  });

  it('「次へ」「前へ」で、時系列の並び順に1件ずつ地点を移る', async () => {
    const user = userEvent.setup();
    render(<MapView target={座標を登録したケース} />);

    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('2 / 3 県道の交差点')).toBeInTheDocument();
    expect(選択中の証言().getByText('県道の防犯カメラ')).toBeInTheDocument();
    expect(await screen.findByText('地図で選択中の番号: 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '前へ' }));
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
  });

  it('最初の地点では「前へ」を、最後の地点では「次へ」を押せない', async () => {
    const user = userEvent.setup();
    render(<MapView target={座標を登録したケース} />);

    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('3 / 3 湖畔の別荘')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('地図のピンを選ぶと、そのピンの証言を選択する', async () => {
    const user = userEvent.setup();
    render(<MapView target={座標を登録したケース} />);

    await user.click(await screen.findByRole('button', { name: 'ピン: 県道の交差点（2）' }));

    expect(screen.getByText('2 / 3 県道の交差点')).toBeInTheDocument();
  });

  it('複数の証言があるピンを続けて選ぶと、その場所の証言を順に切り替え、最後の次は最初に戻る', async () => {
    const user = userEvent.setup();
    render(<MapView target={座標を登録したケース} />);
    const 別荘のピン = await screen.findByRole('button', { name: 'ピン: 湖畔の別荘（1・3）' });

    // 前提: 最初は1番目（湖畔の別荘）を選択している
    await user.click(別荘のピン);
    expect(screen.getByText('3 / 3 湖畔の別荘')).toBeInTheDocument();

    await user.click(別荘のピン);
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
  });

  it('地図に表示できない証言を、理由ごとに分けて一覧にする', () => {
    const 交差点に座標が無いケース: Case = {
      ...座標を登録したケース,
      places: [座標を登録したケース.places[0]!, { id: 'place-crossing', name: '県道の交差点' }],
    };
    render(<MapView target={交差点に座標が無いケース} />);

    const 一覧 = within(screen.getByRole('region', { name: '地図に表示できない証言' }));
    expect(within(一覧.getByRole('list', { name: '場所に座標が登録されていない証言' })).getByText('県道の防犯カメラ')).toBeInTheDocument();
    const 場所なし = within(一覧.getByRole('list', { name: '場所を述べていない証言' }));
    expect(場所なし.getByText('架空日報 朝刊')).toBeInTheDocument();
    expect(場所なし.getByText('ユーザーの推測')).toBeInTheDocument();
  });

  it('すべての証言を地図に表示できる場合は、表示できない証言の一覧を出さない', () => {
    const 別荘の証言だけのケース: Case = {
      ...座標を登録したケース,
      claims: 座標を登録したケース.claims.filter((claim) => claim.placeId === 'place-villa'),
      relationships: [],
    };
    render(<MapView target={別荘の証言だけのケース} />);

    expect(screen.queryByRole('region', { name: '地図に表示できない証言' })).not.toBeInTheDocument();
  });

  it('地図に表示できる証言が1件も無い場合は、地図を出さずに、座標の登録と場所への言及を案内する', () => {
    // 前提: サンプルのケースの場所には座標が登録されていない
    render(<MapView target={sampleFictionalCase} />);

    expect(screen.getByText(/地図に表示できる証言がまだありません/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '地図に表示できない証言' })).toBeInTheDocument();
  });

  describe('人物の移動の確認', () => {
    /**
     * 別荘の持ち主の移動を確かめるケースです。
     * 県道の交差点を別荘から約11キロメートル北に置き、防犯カメラの時刻を別荘の見回り（19:00）の5分後にしています。
     * 隣家の証言は日時を消しています。持ち主に言及する証言は 管理人（19:00 別荘）・防犯カメラ（19:05 交差点）・隣家（日時なし）・架空日報（場所なし）・推測（場所なし）です。
     */
    const 移動を確かめるケース: Case = {
      ...座標を登録したケース,
      places: [座標を登録したケース.places[0]!, { id: 'place-crossing', name: '県道の交差点', latitude: 35.6, longitude: 138.76 }],
      claims: 座標を登録したケース.claims.map((claim) => {
        if (claim.id === 'claim-police-camera') return { ...claim, when: '1998-08-12T19:05' };
        if (claim.id === 'claim-neighbor') return { ...claim, when: undefined };
        return claim;
      }),
    };

    /** 移動を確かめる人物を選びます。 */
    async function 人物を選ぶ(user: ReturnType<typeof userEvent.setup>, 名前: string) {
      await user.selectOptions(screen.getByLabelText('移動を確かめる人物'), 名前);
    }

    it('人物を選ぶと、その人物の日時と座標のある証言だけを、日時の順にたどる', async () => {
      const user = userEvent.setup();
      render(<MapView target={移動を確かめるケース} />);

      await 人物を選ぶ(user, '別荘の持ち主');

      expect(screen.getByText('1 / 2 湖畔の別荘')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ピン: 湖畔の別荘（1）' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ピン: 県道の交差点（2）' })).toBeInTheDocument();
    });

    it('移動区間ごとに、直線距離・時刻の差・移動手段ごとの概算所要時間を、概算であることと共に表示する', async () => {
      const user = userEvent.setup();
      render(<MapView target={移動を確かめるケース} />);

      await 人物を選ぶ(user, '別荘の持ち主');

      const 確認 = within(screen.getByRole('region', { name: '移動の確認' }));
      expect(確認.getByText(/直線距離と想定した速さによる概算/)).toBeInTheDocument();
      const 区間 = within(確認.getByRole('listitem', { name: '1 湖畔の別荘 → 2 県道の交差点' }));
      expect(区間.getByText('直線距離 11.2 km')).toBeInTheDocument();
      expect(区間.getByText('時刻の差 5分')).toBeInTheDocument();
      expect(区間.getByText('徒歩 2時間19分')).toBeInTheDocument();
      expect(区間.getByText('車 16分')).toBeInTheDocument();
    });

    it('時刻の差のうちに移動できない区間を、ほかの区間と区別して示す', async () => {
      const user = userEvent.setup();
      render(<MapView target={移動を確かめるケース} />);

      await 人物を選ぶ(user, '別荘の持ち主');

      const 区間 = within(screen.getByRole('listitem', { name: '1 湖畔の別荘 → 2 県道の交差点' }));
      expect(区間.getByText('どの移動手段でも、時刻の差のうちに移動できません')).toBeInTheDocument();
      expect(区間.getAllByText('間に合わない')).toHaveLength(3);
    });

    it('日時・場所・座標の無い証言を、移動の確認から外した理由ごとに一覧にする', async () => {
      const user = userEvent.setup();
      render(<MapView target={移動を確かめるケース} />);

      await 人物を選ぶ(user, '別荘の持ち主');

      const 一覧 = within(screen.getByRole('region', { name: '移動の確認から外した証言' }));
      expect(within(一覧.getByRole('list', { name: '日時が無い証言' })).getByText('隣家の住人')).toBeInTheDocument();
      const 場所なし = within(一覧.getByRole('list', { name: '場所を述べていない証言' }));
      expect(場所なし.getByText('架空日報 朝刊')).toBeInTheDocument();
      expect(場所なし.getByText('ユーザーの推測')).toBeInTheDocument();
    });

    it('人物の選択を外すと、すべての証言を時系列の並び順にたどる表示に戻る', async () => {
      const user = userEvent.setup();
      render(<MapView target={移動を確かめるケース} />);

      await 人物を選ぶ(user, '別荘の持ち主');
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await 人物を選ぶ(user, '人物を選ばない（すべての証言）');

      expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '移動の確認' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: '地図に表示できない証言' })).toBeInTheDocument();
    });
  });
});
