/**
 * グラフビュー（人物と証言のつながりを図で表す表示）のテスト
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { resetMockNavigation } from '@/test/mock-navigation';
import { GraphView } from './GraphView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  // ノードのリンク先の組み立てにケースのIDをURLから読み取るため、ケースのボードのURLから始める
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

/**
 * 図（SVG）に、画面上の大きさを与えます。
 * jsdom は要素の大きさを持たないため、これが無いとマウスの位置を図の座標へ直せず、拡大縮小やドラッグを確かめられません。
 */
function 図に大きさを与える() {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 300,
    right: 600,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe('GraphView', () => {
  it('人物のノードを、その人物の詳細ページへのリンクとして描く', () => {
    render(<GraphView target={sampleFictionalCase} />);

    const 管理人 = screen.getByRole('link', { name: '人物: 管理人' });
    expect(管理人).toHaveAttribute('href', `/cases/${sampleFictionalCase.id}/persons/person-caretaker?tab=graph`);
  });

  it('証言のノードを、その証言の詳細ページへのリンクとして描く', () => {
    render(<GraphView target={sampleFictionalCase} />);

    const 管理人の証言 = screen.getByRole('link', { name: /^証言: .*見回りをしたとき/ });
    expect(管理人の証言).toHaveAttribute('href', `/cases/${sampleFictionalCase.id}/claims/claim-caretaker?tab=graph`);
  });

  it('ユーザーの推測のノードは、開く先の詳細が無いためリンクにしない', () => {
    render(<GraphView target={sampleFictionalCase} />);

    expect(screen.getByText('ユーザーの推測')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ユーザーの推測' })).not.toBeInTheDocument();
  });

  it('エッジの種類の読み方を、凡例で示す', () => {
    render(<GraphView target={sampleFictionalCase} />);

    const 凡例 = screen.getByRole('list', { name: '線の見方' });
    expect(within(凡例).getByText('発言')).toBeInTheDocument();
    expect(within(凡例).getByText('経由')).toBeInTheDocument();
    expect(within(凡例).getByText('言及')).toBeInTheDocument();
  });

  it('人物も証言も登録されていないケースでは、書き足しを促す案内を出す', () => {
    const 空のケース: Case = { ...sampleFictionalCase, persons: [], places: [], claims: [], relationships: [], timelineOrder: [] };

    render(<GraphView target={空のケース} />);

    expect(screen.getByText(/人物も証言もまだ登録されていません/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '人物と証言のつながり' })).not.toBeInTheDocument();
  });

  it('図全体に、何を表した図かが分かる名前を付ける', () => {
    // 前提: 図の中身（SVG）は読み上げでたどれないため、図そのものに名前を付け、ノードのリンクで中身をたどれるようにする
    render(<GraphView target={sampleFictionalCase} />);

    expect(screen.getByRole('group', { name: '人物と証言のつながり' })).toBeInTheDocument();
  });
});

describe('GraphView（人物どうしの関係）', () => {
  /** 片方向で根拠のある関係と、双方向で根拠の無い関係を1件ずつ持つケースです。 */
  const 関係を2件持つケース: Case = {
    ...sampleFictionalCase,
    relationships: [
      {
        id: 'relationship-employment',
        fromPersonId: 'person-owner',
        toPersonId: 'person-caretaker',
        label: '雇用主',
        directed: true,
        basisClaimIds: ['claim-caretaker'],
      },
      {
        id: 'relationship-acquaintance',
        fromPersonId: 'person-owner',
        toPersonId: 'person-neighbor',
        label: '面識がある',
        directed: false,
        basisClaimIds: [],
      },
    ],
  };

  /**
   * 図に描かれた、指定した種類の線を返します。線は読み上げの対象にしないため、種類の属性から取り出します。
   * 証言から導いた線は直線（line）、関係の線は弧（path）で描くため、要素の名前では絞り込みません。
   */
  function 線を取り出す(container: HTMLElement, kind: string): SVGElement[] {
    return Array.from(container.querySelectorAll<SVGElement>(`[data-edge-kind="${kind}"]`));
  }

  /** 弧（2次ベジェ曲線）の経路から、ふくらみ具合を決める制御点の座標を読み取ります。 */
  function 制御点を読む(線: SVGElement): { x: number; y: number } {
    const 経路 = 線.getAttribute('d') ?? '';
    const 一致 = /Q\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(経路);
    if (!一致) throw new Error(`弧の経路を読み取れませんでした: ${経路}`);
    return { x: Number(一致[1]), y: Number(一致[2]) };
  }

  it('登録された関係を、人物と人物を結ぶ線として描く', () => {
    const { container } = render(<GraphView target={関係を2件持つケース} />);

    expect(線を取り出す(container, 'relates')).toHaveLength(2);
  });

  it('片方向の関係には矢印を付け、双方向の関係には付けない', () => {
    const { container } = render(<GraphView target={関係を2件持つケース} />);

    const [雇用主, 面識がある] = 線を取り出す(container, 'relates');
    expect(雇用主?.getAttribute('marker-end')).toMatch(/^url\(#/);
    expect(面識がある?.getAttribute('marker-end')).toBeNull();
  });

  it('根拠の証言が登録されていない関係を、根拠のある関係とは違う線で描く', () => {
    const { container } = render(<GraphView target={関係を2件持つケース} />);

    const [雇用主, 面識がある] = 線を取り出す(container, 'relates');
    expect(雇用主?.getAttribute('stroke-dasharray')).toBeNull();
    expect(面識がある?.getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('同じ2人の間に複数の関係があっても、線が重ならないよう、関係は弧で描く', () => {
    // 前提: サンプルのケースは、別荘の持ち主と管理人の間に「雇用主」と「金銭トラブル？」の2件の関係を持つ
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    const 関係の線 = 線を取り出す(container, 'relates');
    expect(関係の線).toHaveLength(2);
    expect(関係の線.every((線) => 線.tagName === 'path')).toBe(true);

    // 弧のふくらみ具合は制御点（2次ベジェ曲線の Q の座標）で決まるため、2本の制御点が十分に離れていることを確かめる
    const [制御点1, 制御点2] = 関係の線.map((線) => 制御点を読む(線));
    const 制御点の距離 = Math.hypot(制御点1!.x - 制御点2!.x, 制御点1!.y - 制御点2!.y);
    expect(制御点の距離).toBeGreaterThan(40);
  });

  /** 人物2人と、その間の関係1件だけを持つケースを作ります。線の形を、他の線に邪魔されずに確かめるために使います。 */
  function 関係を1件だけ持つケース(directed: boolean): Case {
    return {
      ...sampleFictionalCase,
      persons: [
        { id: 'person-owner', name: '別荘の持ち主' },
        { id: 'person-caretaker', name: '管理人' },
      ],
      claims: [],
      timelineOrder: [],
      relationships: [
        {
          id: 'relationship-employment',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '雇用主',
          directed,
          basisClaimIds: [],
        },
      ],
    };
  }

  /** 弧（2次ベジェ曲線）の経路から、終点の座標を読み取ります。 */
  function 終点を読む(線: SVGElement): { x: number; y: number } {
    const 経路 = 線.getAttribute('d') ?? '';
    const 一致 = /Q\s+-?[\d.]+\s+-?[\d.]+\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(経路);
    if (!一致) throw new Error(`弧の経路を読み取れませんでした: ${経路}`);
    return { x: Number(一致[1]), y: Number(一致[2]) };
  }

  /** 線の終点から、いちばん近いノードの中心までの距離を返します。 */
  function 終点とノードの距離(container: HTMLElement, 線: SVGElement): number {
    const 終点 = 終点を読む(線);
    const 距離 = Array.from(container.querySelectorAll<SVGCircleElement>('circle')).map((circle) =>
      Math.hypot(Number(circle.getAttribute('cx')) - 終点.x, Number(circle.getAttribute('cy')) - 終点.y)
    );
    return Math.min(...距離);
  }

  it('矢印を付けない双方向の関係は、線をノードの縁まで届かせる', () => {
    // 前提: 人物のノードの半径は26px。矢印のぶんの余白は、矢印を付ける線にだけ空ける
    const { container } = render(<GraphView target={関係を1件だけ持つケース(false)} />);

    const [関係の線] = 線を取り出す(container, 'relates');
    expect(終点とノードの距離(container, 関係の線!)).toBeCloseTo(26, 5);
  });

  it('矢印を付ける片方向の関係は、矢印の先端がノードの縁に触れる位置で線を止める', () => {
    const { container } = render(<GraphView target={関係を1件だけ持つケース(true)} />);

    const [関係の線] = 線を取り出す(container, 'relates');
    expect(終点とノードの距離(container, 関係の線!)).toBeCloseTo(30, 5);
  });

  it('関係の線に、関係の名前と根拠の有無を、読み上げとマウスの重ねで伝える名前を付ける', () => {
    const { container } = render(<GraphView target={関係を2件持つケース} />);

    const [雇用主, 面識がある] = 線を取り出す(container, 'relates');
    expect(雇用主?.querySelector('title')?.textContent).toBe('雇用主');
    expect(面識がある?.querySelector('title')?.textContent).toBe('面識がある（根拠未登録）');
  });

  it('関係の線の読み方を、凡例で示す', () => {
    render(<GraphView target={関係を2件持つケース} />);

    const 凡例 = screen.getByRole('list', { name: '線の見方' });
    expect(within(凡例).getByText('関係')).toBeInTheDocument();
    expect(within(凡例).getByText('関係（根拠未登録）')).toBeInTheDocument();
  });

  it('「関係を表示」を外すと、関係の線と、その凡例を消す', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={関係を2件持つケース} />);

    await user.click(screen.getByRole('checkbox', { name: '関係を表示' }));

    expect(線を取り出す(container, 'relates')).toHaveLength(0);
    // 証言から導いた線は、関係を消しても残る
    expect(線を取り出す(container, 'speaks').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('list', { name: '線の見方' })).queryByText('関係')).not.toBeInTheDocument();
  });

  it('関係を消しても、ノードの配置は変えない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={関係を2件持つケース} />);
    const 配置を読む = () =>
      Array.from(container.querySelectorAll<SVGCircleElement>('circle')).map((circle) => circle.getAttribute('cx'));

    const 消す前の配置 = 配置を読む();
    await user.click(screen.getByRole('checkbox', { name: '関係を表示' }));

    expect(配置を読む()).toEqual(消す前の配置);
  });
});

describe('GraphView（拡大縮小と移動）', () => {
  /** 図（SVG）を返します。 */
  function 図を取り出す(): SVGElement {
    return screen.getByRole('group', { name: '人物と証言のつながり' }) as unknown as SVGElement;
  }

  /** 図の表示範囲（viewBox属性）を読みます。 */
  function 表示範囲を読む(): { x: number; y: number; width: number; height: number } {
    const [x, y, width, height] = (図を取り出す().getAttribute('viewBox') ?? '').split(' ').map(Number);
    return { x: x!, y: y!, width: width!, height: height! };
  }

  /** 図のノード（丸）の中心のx座標を、ノードのIDごとに読みます。 */
  function ノードの位置を読む(container: HTMLElement): Record<string, string> {
    const 位置: Record<string, string> = {};
    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((ノード) => {
      位置[ノード.getAttribute('data-node-id')!] = ノード.querySelector('circle')?.getAttribute('cx') ?? '';
    });
    return 位置;
  }

  beforeEach(() => {
    図に大きさを与える();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('「拡大」を押すと、表示範囲が狭くなる', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);
    const 拡大前 = 表示範囲を読む();

    await user.click(screen.getByRole('button', { name: '拡大' }));

    expect(表示範囲を読む().width).toBeLessThan(拡大前.width);
  });

  it('「縮小」を押すと、表示範囲が広くなる', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);
    const 縮小前 = 表示範囲を読む();

    await user.click(screen.getByRole('button', { name: '縮小' }));

    expect(表示範囲を読む().width).toBeGreaterThan(縮小前.width);
  });

  it('拡大しても、ノードの配置は計算し直さない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const 拡大前の位置 = ノードの位置を読む(container);

    await user.click(screen.getByRole('button', { name: '拡大' }));

    expect(ノードの位置を読む(container)).toEqual(拡大前の位置);
  });

  it('いまの倍率を数字で示す', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);
    expect(screen.getByText('100%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '拡大' }));

    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('「表示を戻す」を押すと、図の全体が収まる表示範囲に戻す', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);
    const もとの表示範囲 = 表示範囲を読む();

    await user.click(screen.getByRole('button', { name: '拡大' }));
    await user.click(screen.getByRole('button', { name: '表示を戻す' }));

    expect(表示範囲を読む()).toEqual(もとの表示範囲);
  });

  it('マウスホイールを上に回すと拡大する', () => {
    render(<GraphView target={sampleFictionalCase} />);
    const 拡大前 = 表示範囲を読む();

    fireEvent.wheel(図を取り出す(), { deltaY: -100, clientX: 300, clientY: 150 });

    expect(表示範囲を読む().width).toBeLessThan(拡大前.width);
  });

  it('マウスホイールを下に回すと縮小する', () => {
    render(<GraphView target={sampleFictionalCase} />);
    const 縮小前 = 表示範囲を読む();

    fireEvent.wheel(図を取り出す(), { deltaY: 100, clientX: 300, clientY: 150 });

    expect(表示範囲を読む().width).toBeGreaterThan(縮小前.width);
  });

  it('図の背景をドラッグすると、表示範囲が動く', () => {
    render(<GraphView target={sampleFictionalCase} />);
    const 移動前 = 表示範囲を読む();

    fireEvent.pointerDown(図を取り出す(), { clientX: 300, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 360, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 360, clientY: 150, pointerId: 1 });

    // 図を右へ引っ張ったため、見えている窓は左（xが小さい方）へ動く
    expect(表示範囲を読む().x).toBeLessThan(移動前.x);
    expect(表示範囲を読む().width).toBeCloseTo(移動前.width, 5);
  });
});

describe('GraphView（ノードを手で動かす）', () => {
  /** 指定したノードの要素を返します。 */
  function ノードを取り出す(container: HTMLElement, nodeId: string): SVGElement {
    const ノード = container.querySelector<SVGElement>(`[data-node-id="${nodeId}"]`);
    if (!ノード) throw new Error(`ノードが見つかりません: ${nodeId}`);
    return ノード;
  }

  /** ノードの丸の中心の座標を読みます。 */
  function 丸の中心を読む(container: HTMLElement, nodeId: string): { x: number; y: number } {
    const 丸 = ノードを取り出す(container, nodeId).querySelector('circle');
    return { x: Number(丸?.getAttribute('cx')), y: Number(丸?.getAttribute('cy')) };
  }

  /** ノードを、画面の座標で指定した量だけドラッグします。 */
  function ドラッグする(ノード: SVGElement, 移動量: { x: number; y: number }) {
    fireEvent.pointerDown(ノード, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 100 + 移動量.x, clientY: 100 + 移動量.y, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100 + 移動量.x, clientY: 100 + 移動量.y, pointerId: 1 });
  }

  beforeEach(() => {
    図に大きさを与える();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ノードをドラッグすると、そのノードが動く', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const 動かす前 = 丸の中心を読む(container, 'person:person-caretaker');

    ドラッグする(ノードを取り出す(container, 'person:person-caretaker'), { x: 60, y: 30 });

    const 動かした後 = 丸の中心を読む(container, 'person:person-caretaker');
    expect(動かした後.x).toBeGreaterThan(動かす前.x);
    expect(動かした後.y).toBeGreaterThan(動かす前.y);
  });

  it('ノードをドラッグしても、他のノードは動かさない', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const 動かす前 = 丸の中心を読む(container, 'person:person-owner');

    ドラッグする(ノードを取り出す(container, 'person:person-caretaker'), { x: 60, y: 30 });

    expect(丸の中心を読む(container, 'person:person-owner')).toEqual(動かす前);
  });

  /**
   * ノードをクリックし、リンクをたどる既定の動作が止められたかどうかを返します。
   *
   * Reactのイベントは、要素ではなく描画先のまとまり（container）にまとめて登録されます。
   * そのため、その外側にある body でクリックを受け取り、そこまで伝わった時点で既定の動作が
   * 止められているかを確かめます。
   */
  function クリックの既定の動作が止まるか(ノード: SVGElement, 初期化 = {}): boolean {
    let 止まった = false;
    const 記録する = (event: Event) => {
      止まった = event.defaultPrevented;
    };
    document.body.addEventListener('click', 記録する);
    fireEvent.click(ノード, 初期化);
    document.body.removeEventListener('click', 記録する);
    return 止まった;
  }

  it('ノードをドラッグしたときは、そのノードの詳細ページを開かない', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const ノード = ノードを取り出す(container, 'person:person-caretaker');

    ドラッグする(ノード, { x: 60, y: 30 });

    // マウスで押したときのクリックは detail が 1 以上になる（キーボードで開いた場合は 0）
    expect(クリックの既定の動作が止まるか(ノード, { detail: 1 })).toBe(true);
  });

  it('動かさずに押した場合は、詳細ページへのリンクをそのまま働かせる', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const ノード = ノードを取り出す(container, 'person:person-caretaker');

    fireEvent.pointerDown(ノード, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(クリックの既定の動作が止まるか(ノード, { detail: 1 })).toBe(false);
  });

  it('ドラッグの後でも、キーボードで開いたリンクは打ち消さない', () => {
    // 前提: キーボード（Enter・Space）で押したときのクリックは、マウスの押し下げを伴わないため detail が 0 になる
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    ドラッグする(ノードを取り出す(container, 'person:person-caretaker'), { x: 60, y: 30 });

    const 別のノード = ノードを取り出す(container, 'person:person-owner');
    expect(クリックの既定の動作が止まるか(別のノード, { detail: 0 })).toBe(false);
  });

  it('2本目の指で触れても、1本目の指のドラッグを乱さない', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const ノード = ノードを取り出す(container, 'person:person-caretaker');

    fireEvent.pointerDown(ノード, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    const 掴んだ直後の位置 = 丸の中心を読む(container, 'person:person-caretaker');
    // 2本目の指の動きは、1本目の指のドラッグには関係しないため、ノードを動かさない
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400, pointerId: 2 });

    expect(丸の中心を読む(container, 'person:person-caretaker')).toEqual(掴んだ直後の位置);
  });

  it('2本目の指を離しても、1本目の指のドラッグは続く', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const ノード = ノードを取り出す(container, 'person:person-caretaker');
    const 動かす前 = 丸の中心を読む(container, 'person:person-caretaker');

    fireEvent.pointerDown(ノード, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130, pointerId: 1 });

    expect(丸の中心を読む(container, 'person:person-caretaker').x).toBeGreaterThan(動かす前.x);
  });

  it('「表示を戻す」を押すと、手で動かしたノードももとの位置に戻す', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const 動かす前 = 丸の中心を読む(container, 'person:person-caretaker');

    ドラッグする(ノードを取り出す(container, 'person:person-caretaker'), { x: 60, y: 30 });
    await user.click(screen.getByRole('button', { name: '表示を戻す' }));

    expect(丸の中心を読む(container, 'person:person-caretaker')).toEqual(動かす前);
  });
});

describe('GraphView（つながりの強調）', () => {
  /** 薄く描かれている要素のIDを集めます。 */
  function 薄いノードのID(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<SVGElement>('[data-node-id][data-dimmed="true"]')).map(
      (ノード) => ノード.getAttribute('data-node-id')!
    );
  }

  it('ノードにマウスを重ねると、つながっていないノードを薄くする', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    await user.hover(container.querySelector('[data-node-id="person:person-caretaker"]')!);

    // 前提: 管理人は自分の証言とだけ線でつながっており、無関係な人物は薄くなる
    expect(薄いノードのID(container)).not.toContain('person:person-caretaker');
    expect(薄いノードのID(container)).toContain('person:person-neighbor');
  });

  it('マウスを重ねたノードにつながる線は、薄くしない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    await user.hover(container.querySelector('[data-node-id="person:person-caretaker"]')!);

    const 管理人の発言の線 = container.querySelector('[data-edge-kind="speaks"][data-dimmed="false"]');
    expect(管理人の発言の線).not.toBeNull();
  });

  it('マウスを離すと、薄い表示を元に戻す', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const ノード = container.querySelector<SVGElement>('[data-node-id="person:person-caretaker"]')!;

    await user.hover(ノード);
    await user.unhover(ノード);

    expect(薄いノードのID(container)).toHaveLength(0);
  });
});

describe('GraphView（表示するものの絞り込み）', () => {
  it('「証言を表示」を外すと、証言のノードを描かない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    expect(container.querySelector('[data-node-id^="claim:"]')).not.toBeNull();

    await user.click(screen.getByRole('checkbox', { name: '証言を表示' }));

    expect(container.querySelector('[data-node-id^="claim:"]')).toBeNull();
    expect(container.querySelector('[data-node-id^="person:"]')).not.toBeNull();
  });

  it('「人物を表示」を外すと、人物のノードを描かない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    await user.click(screen.getByRole('checkbox', { name: '人物を表示' }));

    expect(container.querySelector('[data-node-id^="person:"]')).toBeNull();
    expect(container.querySelector('[data-node-id^="claim:"]')).not.toBeNull();
  });

  it('絞り込んでも、残ったノードの位置は変えない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const 絞り込む前 = container.querySelector('[data-node-id="person:person-caretaker"] circle')?.getAttribute('cx');

    await user.click(screen.getByRole('checkbox', { name: '証言を表示' }));

    expect(container.querySelector('[data-node-id="person:person-caretaker"] circle')?.getAttribute('cx')).toBe(絞り込む前);
  });
});
