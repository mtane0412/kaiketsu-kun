/**
 * 地図ビュー（時系列の並び順を地図上でたどる表示）のテスト
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { MapPin } from '@/domain/case-views';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { buildLargeCase } from '@/test/large-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { MapView } from './MapView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** テストで与える、地図に重ねるパネルの高さ（px）です。 */
const PANEL_VIEWPORT_HEIGHT = 800;

/**
 * 地図に重ねるパネルに、高さを与えます。テストが終わると元に戻します。
 * jsdom はレイアウトを計算せず、要素の高さはすべて 0 になります。一覧はパネルに見える分の証言だけを描画するため、高さが無いと描画する範囲を決められません。
 */
function givePanelViewportHeight() {
  const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(PANEL_VIEWPORT_HEIGHT);
  onTestFinished(() => clientHeight.mockRestore());
}

beforeEach(() => {
  givePanelViewportHeight();
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
const caseWithCoordinates: Case = {
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
function getSelectedClaim() {
  return within(screen.getByRole('list', { name: '選択中の証言' }));
}

describe('MapView', () => {
  it('最初は時系列の1番目の地点を選び、場所ごとにまとめたピンを地図に渡す', async () => {
    render(<MapView target={caseWithCoordinates} />);

    expect(await screen.findByText('地図で選択中の番号: 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ピン: 湖畔の別荘（1・3）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ピン: 県道の交差点（2）' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
    expect(getSelectedClaim().getByText('管理人')).toBeInTheDocument();
  });

  it('「次へ」「前へ」で、時系列の並び順に1件ずつ地点を移る', async () => {
    const user = userEvent.setup();
    render(<MapView target={caseWithCoordinates} />);

    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('2 / 3 県道の交差点')).toBeInTheDocument();
    expect(getSelectedClaim().getByText('県道の防犯カメラ')).toBeInTheDocument();
    expect(await screen.findByText('地図で選択中の番号: 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '前へ' }));
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
  });

  it('最初の地点では「前へ」を、最後の地点では「次へ」を押せない', async () => {
    const user = userEvent.setup();
    render(<MapView target={caseWithCoordinates} />);

    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('3 / 3 湖畔の別荘')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('地図のピンを選ぶと、そのピンの証言を選択する', async () => {
    const user = userEvent.setup();
    render(<MapView target={caseWithCoordinates} />);

    await user.click(await screen.findByRole('button', { name: 'ピン: 県道の交差点（2）' }));

    expect(screen.getByText('2 / 3 県道の交差点')).toBeInTheDocument();
  });

  it('複数の証言があるピンを続けて選ぶと、その場所の証言を順に切り替え、最後の次は最初に戻る', async () => {
    const user = userEvent.setup();
    render(<MapView target={caseWithCoordinates} />);
    const villaPin = await screen.findByRole('button', { name: 'ピン: 湖畔の別荘（1・3）' });

    // 前提: 最初は1番目（湖畔の別荘）を選択している
    await user.click(villaPin);
    expect(screen.getByText('3 / 3 湖畔の別荘')).toBeInTheDocument();

    await user.click(villaPin);
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
  });

  it('受け取った絞り込みの欄を、地図に重ねるパネルの中に表示する', () => {
    render(<MapView target={caseWithCoordinates} filterPanel={<section aria-label="証言の絞り込み" />} />);

    const panel = within(screen.getByRole('region', { name: '地図の操作' }));
    expect(panel.getByRole('region', { name: '証言の絞り込み' })).toBeInTheDocument();
    expect(panel.getByLabelText('移動を確かめる人物')).toBeInTheDocument();
    expect(panel.getByRole('list', { name: '選択中の証言' })).toBeInTheDocument();
  });

  it('「パネルを隠す」で地図に重ねたパネルを隠し、「パネルを表示」で戻す', async () => {
    const user = userEvent.setup();
    render(<MapView target={caseWithCoordinates} />);

    await user.click(screen.getByRole('button', { name: 'パネルを隠す' }));
    // パネルを隠している間も、地図は表示したままにする
    expect(screen.queryByRole('region', { name: '地図の操作' })).not.toBeInTheDocument();
    expect(screen.getByText('地図で選択中の番号: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'パネルを表示' }));
    expect(screen.getByRole('region', { name: '地図の操作' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
  });

  it('地図に表示できない証言を、理由ごとに分けて一覧にする', () => {
    const caseWithoutIntersectionCoordinates: Case = {
      ...caseWithCoordinates,
      places: [caseWithCoordinates.places[0]!, { id: 'place-crossing', name: '県道の交差点' }],
    };
    render(<MapView target={caseWithoutIntersectionCoordinates} />);

    const list = within(screen.getByRole('region', { name: '地図に表示できない証言' }));
    expect(within(list.getByRole('list', { name: '場所に座標が登録されていない証言' })).getByText('県道の防犯カメラ')).toBeInTheDocument();
    const noPlace = within(list.getByRole('list', { name: '場所を述べていない証言' }));
    expect(noPlace.getByText('架空日報 朝刊')).toBeInTheDocument();
    expect(noPlace.getByText('ユーザーの推測')).toBeInTheDocument();
  });

  it('すべての証言を地図に表示できる場合は、表示できない証言の一覧を出さない', () => {
    const caseWithOnlyVillaClaim: Case = {
      ...caseWithCoordinates,
      claims: caseWithCoordinates.claims.filter((claim) => claim.placeId === 'place-villa'),
      relationships: [],
    };
    render(<MapView target={caseWithOnlyVillaClaim} />);

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
    const travelCheckCase: Case = {
      ...caseWithCoordinates,
      places: [caseWithCoordinates.places[0]!, { id: 'place-crossing', name: '県道の交差点', latitude: 35.6, longitude: 138.76 }],
      claims: caseWithCoordinates.claims.map((claim) => {
        if (claim.id === 'claim-police-camera') return { ...claim, when: '1998-08-12T19:05' };
        if (claim.id === 'claim-neighbor') return { ...claim, when: undefined };
        return claim;
      }),
    };

    /** 移動を確かめる人物を選びます。 */
    async function selectPerson(user: ReturnType<typeof userEvent.setup>, name: string) {
      await user.selectOptions(screen.getByLabelText('移動を確かめる人物'), name);
    }

    it('移動を確かめる対象は、自ら移動するか運ばれる個人と物に限り、組織や記録・媒体は選べない', () => {
      render(<MapView target={travelCheckCase} />);

      const options = within(screen.getByLabelText('移動を確かめる人物'))
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options).toContain('別荘の持ち主');
      expect(options).toContain('隣家の住人');
      expect(options).not.toContain('県道の防犯カメラ');
      expect(options).not.toContain('架空日報 朝刊');
    });

    it('人物を選ぶと、その人物の日時と座標のある証言だけを、日時の順にたどる', async () => {
      const user = userEvent.setup();
      render(<MapView target={travelCheckCase} />);

      await selectPerson(user, '別荘の持ち主');

      expect(screen.getByText('1 / 2 湖畔の別荘')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ピン: 湖畔の別荘（1）' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ピン: 県道の交差点（2）' })).toBeInTheDocument();
    });

    it('移動区間ごとに、直線距離・時刻の差・移動手段ごとの概算所要時間を、概算であることと共に表示する', async () => {
      const user = userEvent.setup();
      render(<MapView target={travelCheckCase} />);

      await selectPerson(user, '別荘の持ち主');

      const check = within(screen.getByRole('region', { name: '移動の確認' }));
      expect(check.getByText(/直線距離と想定した速さによる概算/)).toBeInTheDocument();
      const segment = within(check.getByRole('listitem', { name: '1 湖畔の別荘 → 2 県道の交差点' }));
      expect(segment.getByText('直線距離 11.2 km')).toBeInTheDocument();
      expect(segment.getByText('時刻の差 5分')).toBeInTheDocument();
      expect(segment.getByText('徒歩 2時間19分')).toBeInTheDocument();
      expect(segment.getByText('車 16分')).toBeInTheDocument();
    });

    it('時刻の差のうちに移動できない区間を、ほかの区間と区別して示す', async () => {
      const user = userEvent.setup();
      render(<MapView target={travelCheckCase} />);

      await selectPerson(user, '別荘の持ち主');

      const segment = within(screen.getByRole('listitem', { name: '1 湖畔の別荘 → 2 県道の交差点' }));
      expect(segment.getByText('どの移動手段でも、時刻の差のうちに移動できません')).toBeInTheDocument();
      expect(segment.getAllByText('間に合わない')).toHaveLength(3);
    });

    it('日時・場所・座標の無い証言を、移動の確認から外した理由ごとに一覧にする', async () => {
      const user = userEvent.setup();
      render(<MapView target={travelCheckCase} />);

      await selectPerson(user, '別荘の持ち主');

      const list = within(screen.getByRole('region', { name: '移動の確認から外した証言' }));
      expect(within(list.getByRole('list', { name: '日時が無い証言' })).getByText('隣家の住人')).toBeInTheDocument();
      const noPlace = within(list.getByRole('list', { name: '場所を述べていない証言' }));
      expect(noPlace.getByText('架空日報 朝刊')).toBeInTheDocument();
      expect(noPlace.getByText('ユーザーの推測')).toBeInTheDocument();
    });

    it('人物の選択を外すと、すべての証言を時系列の並び順にたどる表示に戻る', async () => {
      const user = userEvent.setup();
      render(<MapView target={travelCheckCase} />);

      await selectPerson(user, '別荘の持ち主');
      await user.click(screen.getByRole('button', { name: '次へ' }));
      await selectPerson(user, '人物を選ばない（すべての証言）');

      expect(screen.getByText('1 / 3 湖畔の別荘')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '移動の確認' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: '地図に表示できない証言' })).toBeInTheDocument();
    });
  });

  describe('証言が多いケース', () => {
    /** 証言が1,000件あり、どの場所にも座標が無い（すべての証言を地図に表示できない）ケースです。 */
    function buildUnmappedLargeCase(): Case {
      const largeCase = buildLargeCase({ persons: 20, places: 10, interviews: 10, claims: 1000 });
      return { ...largeCase, places: largeCase.places.map(({ id, name }) => ({ id, name })) };
    }

    it('地図に表示できない証言の一覧は、パネルに見える分の証言だけを描画する', () => {
      // 前提: 地図に表示できない証言が1,000件ある。すべてを描くと DOM が大きくなり、地図を開くたびに画面が固まる
      render(<MapView target={buildUnmappedLargeCase()} />);

      const list = screen.getByRole('list', { name: '場所に座標が登録されていない証言' });
      const items = within(list).getAllByRole('listitem');
      // 検証: 先頭の証言は描画し、パネルの外の証言は描画しない。件数の見出しは全件の数を示す
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThan(100);
      expect(within(list).getByText(/（証言0）/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '地図に表示できない証言（1000件）' })).toBeInTheDocument();
    });

    it('パネルを末尾までスクロールすると、一覧の末尾の証言を描画する', () => {
      // 前提: 地図に表示できない証言が1,000件あり、時系列の並び順の最後は「証言999」
      render(<MapView target={buildUnmappedLargeCase()} />);
      const panel = screen.getByRole('region', { name: '地図の操作' });

      act(() => {
        panel.scrollTop = 10_000_000;
        panel.dispatchEvent(new Event('scroll'));
      });

      // 検証: 末尾の証言を描画し、先頭の証言は描画しない
      const list = screen.getByRole('list', { name: '場所に座標が登録されていない証言' });
      expect(within(list).getByText(/（証言999）/)).toBeInTheDocument();
      expect(within(list).queryByText(/（証言0）/)).not.toBeInTheDocument();
    });
  });
});
