/**
 * グラフビュー（人物と証言のつながりを図で表す表示）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { resetMockNavigation } from '@/test/mock-navigation';
import { GraphView } from './GraphView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  // ノードのリンク先の組み立てにケースのIDをURLから読み取るため、ケースのボードのURLから始める
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

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
