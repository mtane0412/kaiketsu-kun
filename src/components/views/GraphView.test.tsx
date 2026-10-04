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
function giveDiagramSize() {
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

    const caretaker = screen.getByRole('link', { name: '人物: 管理人' });
    expect(caretaker).toHaveAttribute('href', `/cases/${sampleFictionalCase.id}/persons/person-caretaker?tab=graph`);
  });

  it('証言のノードを、その証言の詳細ページへのリンクとして描く', () => {
    render(<GraphView target={sampleFictionalCase} />);

    const caretakerClaim = screen.getByRole('link', { name: /^証言: .*見回りをしたとき/ });
    expect(caretakerClaim).toHaveAttribute('href', `/cases/${sampleFictionalCase.id}/claims/claim-caretaker?tab=graph`);
  });

  it('ユーザーの推測のノードは、開く先の詳細が無いためリンクにしない', () => {
    render(<GraphView target={sampleFictionalCase} />);

    expect(screen.getByText('ユーザーの推測')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ユーザーの推測' })).not.toBeInTheDocument();
  });

  it('エッジの種類の読み方を、凡例で示す', () => {
    render(<GraphView target={sampleFictionalCase} />);

    const legend = screen.getByRole('list', { name: '線の見方' });
    expect(within(legend).getByText('発言')).toBeInTheDocument();
    expect(within(legend).getByText('経由')).toBeInTheDocument();
    expect(within(legend).getByText('言及')).toBeInTheDocument();
  });

  it('人物ではない種別のノードは、読み上げの名前に種別を付ける', () => {
    render(<GraphView target={sampleFictionalCase} />);

    expect(screen.getByRole('link', { name: '記録・媒体: 県道の防犯カメラ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '組織: 県警' })).toBeInTheDocument();
  });

  it('画像を登録した人物ではない種別のノードは、画像の上に種別の色の縁取りを描く', () => {
    // 前提: 防犯カメラに画像を登録すると、丸の塗り（種別の色）は画像に覆われて見えなくなる
    const caseData: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-road-camera' ? { ...person, imageDataUrl: 'data:image/jpeg;base64,AAAA' } : person
      ),
    };
    render(<GraphView target={caseData} />);

    const securityCamera = screen.getByRole('link', { name: '記録・媒体: 県道の防犯カメラ' });
    expect(securityCamera.querySelector('[data-person-kind-outline="record"]')).not.toBeNull();
    // 画像の無い人物のノードは、丸の塗りで種別が分かるため、縁取りを描かない
    const prefecturalPolice = screen.getByRole('link', { name: '組織: 県警' });
    expect(prefecturalPolice.querySelector('[data-person-kind-outline]')).toBeNull();
  });

  it('人物の種別のチェックを外すと、その種別のノードを描かない', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);

    const kindFilter = screen.getByRole('group', { name: '表示する人物の種別' });
    await user.click(within(kindFilter).getByRole('checkbox', { name: '記録・媒体' }));

    expect(screen.queryByRole('link', { name: '記録・媒体: 県道の防犯カメラ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '記録・媒体: 架空日報 朝刊' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '人物: 管理人' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '組織: 県警' })).toBeInTheDocument();
  });

  it('人物も証言も登録されていないケースでは、書き足しを促す案内を出す', () => {
    const emptyCase: Case = { ...sampleFictionalCase, persons: [], places: [], claims: [], relationships: [], timelineOrder: [] };

    render(<GraphView target={emptyCase} />);

    expect(screen.getByText(/人物も証言もまだ登録されていません/)).toBeInTheDocument();
    // 前提: 案内には、書き足す場所（時系列のボード）へ移るリンクを添える
    expect(screen.getByRole('link', { name: '時系列のボードで書き足す' })).toHaveAttribute('href', '/cases/case-lakeside');
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
  const caseWithTwoRelationships: Case = {
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
  function getLine(container: HTMLElement, kind: string): SVGElement[] {
    return Array.from(container.querySelectorAll<SVGElement>(`[data-edge-kind="${kind}"]`));
  }

  /** 弧（2次ベジェ曲線）の経路から、ふくらみ具合を決める制御点の座標を読み取ります。 */
  function readControlPoint(line: SVGElement): { x: number; y: number } {
    const path = line.getAttribute('d') ?? '';
    const match = /Q\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(path);
    if (!match) throw new Error(`弧の経路を読み取れませんでした: ${path}`);
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  it('登録された関係を、人物と人物を結ぶ線として描く', () => {
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);

    expect(getLine(container, 'relates')).toHaveLength(2);
  });

  it('片方向の関係には矢印を付け、双方向の関係には付けない', () => {
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);

    const [employer, acquainted] = getLine(container, 'relates');
    expect(employer?.getAttribute('marker-end')).toMatch(/^url\(#/);
    expect(acquainted?.getAttribute('marker-end')).toBeNull();
  });

  it('根拠の証言が登録されていない関係を、根拠のある関係とは違う線で描く', () => {
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);

    const [employer, acquainted] = getLine(container, 'relates');
    expect(employer?.getAttribute('stroke-dasharray')).toBeNull();
    expect(acquainted?.getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('同じ2人の間に複数の関係があっても、線が重ならないよう、関係は弧で描く', () => {
    // 前提: サンプルのケースは、別荘の持ち主と管理人の間に「雇用主」と「金銭トラブル？」の2件の関係を持つ
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    const relationshipLine = getLine(container, 'relates');
    expect(relationshipLine).toHaveLength(2);
    expect(relationshipLine.every((line) => line.tagName === 'path')).toBe(true);

    // 弧のふくらみ具合は制御点（2次ベジェ曲線の Q の座標）で決まるため、2本の制御点が十分に離れていることを確かめる
    const [controlPoint1, controlPoint2] = relationshipLine.map((line) => readControlPoint(line));
    const controlPointDistance = Math.hypot(controlPoint1!.x - controlPoint2!.x, controlPoint1!.y - controlPoint2!.y);
    expect(controlPointDistance).toBeGreaterThan(40);
  });

  /** 人物2人と、その間の関係1件だけを持つケースを作ります。線の形を、他の線に邪魔されずに確かめるために使います。 */
  function buildCaseWithOneRelationship(directed: boolean): Case {
    return {
      ...sampleFictionalCase,
      persons: [
        { id: 'person-owner', name: '別荘の持ち主', kind: 'individual' },
        { id: 'person-caretaker', name: '管理人', kind: 'individual' },
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
  function readEndpoint(line: SVGElement): { x: number; y: number } {
    const path = line.getAttribute('d') ?? '';
    const match = /Q\s+-?[\d.]+\s+-?[\d.]+\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(path);
    if (!match) throw new Error(`弧の経路を読み取れませんでした: ${path}`);
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  /** 線の終点から、いちばん近いノードの中心までの距離を返します。 */
  function measureEndpointToNodeDistance(container: HTMLElement, line: SVGElement): number {
    const endpoint = readEndpoint(line);
    const distance = Array.from(container.querySelectorAll<SVGCircleElement>('circle')).map((circle) =>
      Math.hypot(Number(circle.getAttribute('cx')) - endpoint.x, Number(circle.getAttribute('cy')) - endpoint.y)
    );
    return Math.min(...distance);
  }

  it('矢印を付けない双方向の関係は、線をノードの縁まで届かせる', () => {
    // 前提: 人物のノードの半径は26px。矢印のぶんの余白は、矢印を付ける線にだけ空ける
    const { container } = render(<GraphView target={buildCaseWithOneRelationship(false)} />);

    const [relationshipLine] = getLine(container, 'relates');
    expect(measureEndpointToNodeDistance(container, relationshipLine!)).toBeCloseTo(26, 5);
  });

  it('矢印を付ける片方向の関係は、矢印の先端がノードの縁に触れる位置で線を止める', () => {
    const { container } = render(<GraphView target={buildCaseWithOneRelationship(true)} />);

    const [relationshipLine] = getLine(container, 'relates');
    expect(measureEndpointToNodeDistance(container, relationshipLine!)).toBeCloseTo(30, 5);
  });

  it('関係の線に、関係の名前と根拠の有無を、読み上げとマウスの重ねで伝える名前を付ける', () => {
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);

    const [employer, acquainted] = getLine(container, 'relates');
    expect(employer?.querySelector('title')?.textContent).toBe('雇用主');
    expect(acquainted?.querySelector('title')?.textContent).toBe('面識がある（根拠未登録）');
  });

  it('関係の線の読み方を、凡例で示す', () => {
    render(<GraphView target={caseWithTwoRelationships} />);

    const legend = screen.getByRole('list', { name: '線の見方' });
    expect(within(legend).getByText('関係')).toBeInTheDocument();
    expect(within(legend).getByText('関係（根拠未登録）')).toBeInTheDocument();
  });

  it('「関係を表示」を外すと、関係の線と、その凡例を消す', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);

    await user.click(screen.getByRole('checkbox', { name: '関係を表示' }));

    expect(getLine(container, 'relates')).toHaveLength(0);
    // 証言から導いた線は、関係を消しても残る
    expect(getLine(container, 'speaks').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('list', { name: '線の見方' })).queryByText('関係')).not.toBeInTheDocument();
  });

  it('時点を指定すると、その時点で成り立たない関係の線を消す', async () => {
    const user = userEvent.setup();
    const caseWithPeriods: Case = {
      ...caseWithTwoRelationships,
      relationships: [
        // 前提: 雇用主は期間を持たず、面識は1998年5月で途絶えている
        caseWithTwoRelationships.relationships[0]!,
        { ...caseWithTwoRelationships.relationships[1]!, until: '1998-05' },
      ],
    };
    const { container } = render(<GraphView target={caseWithPeriods} />);

    await user.type(screen.getByLabelText('時点'), '1998年8月12日');

    const remainingLines = getLine(container, 'relates');
    expect(remainingLines).toHaveLength(1);
    expect(remainingLines[0]?.textContent).toBe('雇用主');
  });

  it('時点を消すと、すべての関係の線を描き直す', async () => {
    const user = userEvent.setup();
    const caseWithPeriods: Case = {
      ...caseWithTwoRelationships,
      relationships: [caseWithTwoRelationships.relationships[0]!, { ...caseWithTwoRelationships.relationships[1]!, until: '1998-05' }],
    };
    const { container } = render(<GraphView target={caseWithPeriods} />);

    await user.type(screen.getByLabelText('時点'), '1998-08-12');
    await user.clear(screen.getByLabelText('時点'));

    expect(getLine(container, 'relates')).toHaveLength(2);
  });

  it('解釈できない時点を入力すると、その旨を示し、関係の線は絞り込まない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);

    await user.type(screen.getByLabelText('時点'), '事件の日');

    expect(screen.getByText(/時点を解釈できません/)).toBeInTheDocument();
    expect(getLine(container, 'relates')).toHaveLength(2);
  });

  it('関係を消しても、ノードの配置は変えない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={caseWithTwoRelationships} />);
    const readLayout = () =>
      Array.from(container.querySelectorAll<SVGCircleElement>('circle')).map((circle) => circle.getAttribute('cx'));

    const layoutBeforeRemoval = readLayout();
    await user.click(screen.getByRole('checkbox', { name: '関係を表示' }));

    expect(readLayout()).toEqual(layoutBeforeRemoval);
  });
});

describe('GraphView（拡大縮小と移動）', () => {
  /** 図（SVG）を返します。 */
  function getDiagram(): SVGElement {
    return screen.getByRole('group', { name: '人物と証言のつながり' }) as unknown as SVGElement;
  }

  /** 図の表示範囲（viewBox属性）を読みます。 */
  function readViewBox(): { x: number; y: number; width: number; height: number } {
    const [x, y, width, height] = (getDiagram().getAttribute('viewBox') ?? '').split(' ').map(Number);
    return { x: x!, y: y!, width: width!, height: height! };
  }

  /** 図のノード（丸）の中心のx座標を、ノードのIDごとに読みます。 */
  function readNodePosition(container: HTMLElement): Record<string, string> {
    const position: Record<string, string> = {};
    container.querySelectorAll<SVGElement>('[data-node-id]').forEach((node) => {
      position[node.getAttribute('data-node-id')!] = node.querySelector('circle')?.getAttribute('cx') ?? '';
    });
    return position;
  }

  beforeEach(() => {
    giveDiagramSize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('「拡大」を押すと、表示範囲が狭くなる', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);
    const beforeZoomIn = readViewBox();

    await user.click(screen.getByRole('button', { name: '拡大' }));

    expect(readViewBox().width).toBeLessThan(beforeZoomIn.width);
  });

  it('「縮小」を押すと、表示範囲が広くなる', async () => {
    const user = userEvent.setup();
    render(<GraphView target={sampleFictionalCase} />);
    const beforeZoomOut = readViewBox();

    await user.click(screen.getByRole('button', { name: '縮小' }));

    expect(readViewBox().width).toBeGreaterThan(beforeZoomOut.width);
  });

  it('拡大しても、ノードの配置は計算し直さない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const positionBeforeZoom = readNodePosition(container);

    await user.click(screen.getByRole('button', { name: '拡大' }));

    expect(readNodePosition(container)).toEqual(positionBeforeZoom);
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
    const originalViewBox = readViewBox();

    await user.click(screen.getByRole('button', { name: '拡大' }));
    await user.click(screen.getByRole('button', { name: '表示を戻す' }));

    expect(readViewBox()).toEqual(originalViewBox);
  });

  it('マウスホイールを上に回すと拡大する', () => {
    render(<GraphView target={sampleFictionalCase} />);
    const beforeZoomIn = readViewBox();

    fireEvent.wheel(getDiagram(), { deltaY: -100, clientX: 300, clientY: 150 });

    expect(readViewBox().width).toBeLessThan(beforeZoomIn.width);
  });

  it('マウスホイールを下に回すと縮小する', () => {
    render(<GraphView target={sampleFictionalCase} />);
    const beforeZoomOut = readViewBox();

    fireEvent.wheel(getDiagram(), { deltaY: 100, clientX: 300, clientY: 150 });

    expect(readViewBox().width).toBeGreaterThan(beforeZoomOut.width);
  });

  it('図の背景をドラッグすると、表示範囲が動く', () => {
    render(<GraphView target={sampleFictionalCase} />);
    const beforeMove = readViewBox();

    fireEvent.pointerDown(getDiagram(), { clientX: 300, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 360, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 360, clientY: 150, pointerId: 1 });

    // 図を右へ引っ張ったため、見えている窓は左（xが小さい方）へ動く
    expect(readViewBox().x).toBeLessThan(beforeMove.x);
    expect(readViewBox().width).toBeCloseTo(beforeMove.width, 5);
  });
});

describe('GraphView（ノードを手で動かす）', () => {
  /** 指定したノードの要素を返します。 */
  function getNode(container: HTMLElement, nodeId: string): SVGElement {
    const node = container.querySelector<SVGElement>(`[data-node-id="${nodeId}"]`);
    if (!node) throw new Error(`ノードが見つかりません: ${nodeId}`);
    return node;
  }

  /** ノードの丸の中心の座標を読みます。 */
  function readCircleCenter(container: HTMLElement, nodeId: string): { x: number; y: number } {
    const nodeCircle = getNode(container, nodeId).querySelector('circle');
    return { x: Number(nodeCircle?.getAttribute('cx')), y: Number(nodeCircle?.getAttribute('cy')) };
  }

  /** ノードを、画面の座標で指定した量だけドラッグします。 */
  function drag(node: SVGElement, movement: { x: number; y: number }) {
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 100 + movement.x, clientY: 100 + movement.y, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100 + movement.x, clientY: 100 + movement.y, pointerId: 1 });
  }

  beforeEach(() => {
    giveDiagramSize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ノードをドラッグすると、そのノードが動く', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const beforeDrag = readCircleCenter(container, 'person:person-caretaker');

    drag(getNode(container, 'person:person-caretaker'), { x: 60, y: 30 });

    const afterDrag = readCircleCenter(container, 'person:person-caretaker');
    expect(afterDrag.x).toBeGreaterThan(beforeDrag.x);
    expect(afterDrag.y).toBeGreaterThan(beforeDrag.y);
  });

  it('ノードをドラッグしても、他のノードは動かさない', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const beforeDrag = readCircleCenter(container, 'person:person-owner');

    drag(getNode(container, 'person:person-caretaker'), { x: 60, y: 30 });

    expect(readCircleCenter(container, 'person:person-owner')).toEqual(beforeDrag);
  });

  /**
   * ノードをクリックし、リンクをたどる既定の動作が止められたかどうかを返します。
   *
   * Reactのイベントは、要素ではなく描画先のまとまり（container）にまとめて登録されます。
   * そのため、その外側にある body でクリックを受け取り、そこまで伝わった時点で既定の動作が
   * 止められているかを確かめます。
   */
  function isClickDefaultPrevented(node: SVGElement, init = {}): boolean {
    let prevented = false;
    const record = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    document.body.addEventListener('click', record);
    fireEvent.click(node, init);
    document.body.removeEventListener('click', record);
    return prevented;
  }

  it('ノードをドラッグしたときは、そのノードの詳細ページを開かない', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const node = getNode(container, 'person:person-caretaker');

    drag(node, { x: 60, y: 30 });

    // マウスで押したときのクリックは detail が 1 以上になる（キーボードで開いた場合は 0）
    expect(isClickDefaultPrevented(node, { detail: 1 })).toBe(true);
  });

  it('動かさずに押した場合は、詳細ページへのリンクをそのまま働かせる', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const node = getNode(container, 'person:person-caretaker');

    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(isClickDefaultPrevented(node, { detail: 1 })).toBe(false);
  });

  it('ドラッグの後でも、キーボードで開いたリンクは打ち消さない', () => {
    // 前提: キーボード（Enter・Space）で押したときのクリックは、マウスの押し下げを伴わないため detail が 0 になる
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    drag(getNode(container, 'person:person-caretaker'), { x: 60, y: 30 });

    const otherNode = getNode(container, 'person:person-owner');
    expect(isClickDefaultPrevented(otherNode, { detail: 0 })).toBe(false);
  });

  it('2本目の指で触れても、1本目の指のドラッグを乱さない', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const node = getNode(container, 'person:person-caretaker');

    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    const positionRightAfterGrab = readCircleCenter(container, 'person:person-caretaker');
    // 2本目の指の動きは、1本目の指のドラッグには関係しないため、ノードを動かさない
    fireEvent.pointerMove(window, { clientX: 400, clientY: 400, pointerId: 2 });

    expect(readCircleCenter(container, 'person:person-caretaker')).toEqual(positionRightAfterGrab);
  });

  it('2本目の指を離しても、1本目の指のドラッグは続く', () => {
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const node = getNode(container, 'person:person-caretaker');
    const beforeDrag = readCircleCenter(container, 'person:person-caretaker');

    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130, pointerId: 1 });

    expect(readCircleCenter(container, 'person:person-caretaker').x).toBeGreaterThan(beforeDrag.x);
  });

  it('「表示を戻す」を押すと、手で動かしたノードももとの位置に戻す', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const beforeDrag = readCircleCenter(container, 'person:person-caretaker');

    drag(getNode(container, 'person:person-caretaker'), { x: 60, y: 30 });
    await user.click(screen.getByRole('button', { name: '表示を戻す' }));

    expect(readCircleCenter(container, 'person:person-caretaker')).toEqual(beforeDrag);
  });
});

describe('GraphView（つながりの強調）', () => {
  /** 薄く描かれている要素のIDを集めます。 */
  function getDimmedNodeIds(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<SVGElement>('[data-node-id][data-dimmed="true"]')).map(
      (node) => node.getAttribute('data-node-id')!
    );
  }

  it('ノードにマウスを重ねると、つながっていないノードを薄くする', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    await user.hover(container.querySelector('[data-node-id="person:person-caretaker"]')!);

    // 前提: 管理人は自分の証言とだけ線でつながっており、無関係な人物は薄くなる
    expect(getDimmedNodeIds(container)).not.toContain('person:person-caretaker');
    expect(getDimmedNodeIds(container)).toContain('person:person-neighbor');
  });

  it('マウスを重ねたノードにつながる線は、薄くしない', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);

    await user.hover(container.querySelector('[data-node-id="person:person-caretaker"]')!);

    const caretakerStatementLine = container.querySelector('[data-edge-kind="speaks"][data-dimmed="false"]');
    expect(caretakerStatementLine).not.toBeNull();
  });

  it('マウスを離すと、薄い表示を元に戻す', async () => {
    const user = userEvent.setup();
    const { container } = render(<GraphView target={sampleFictionalCase} />);
    const node = container.querySelector<SVGElement>('[data-node-id="person:person-caretaker"]')!;

    await user.hover(node);
    await user.unhover(node);

    expect(getDimmedNodeIds(container)).toHaveLength(0);
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
    const beforeFilter = container.querySelector('[data-node-id="person:person-caretaker"] circle')?.getAttribute('cx');

    await user.click(screen.getByRole('checkbox', { name: '証言を表示' }));

    expect(container.querySelector('[data-node-id="person:person-caretaker"] circle')?.getAttribute('cx')).toBe(beforeFilter);
  });
});
