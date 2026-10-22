/**
 * グラフの配置の計算を Web Worker に頼む処理（requestGraphLayout）のテスト
 *
 * jsdom には Web Worker が無いため、受け取ったメッセージを記録し、テストから返事やエラーを送れる偽の Worker に差し替えます。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseGraph } from '@/domain/case-graph';
import type { GraphLayout } from './graph-layout';
import { requestGraphLayout } from './graph-layout-request';

/** テストから操作する、偽の Web Worker です。作られた順に instances へ記録します。 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly received: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(data: unknown) {
    this.received.push(data);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  terminate() {
    this.terminated = true;
  }

  /** Worker からの返事を送ります。 */
  reply(data: unknown) {
    for (const listener of this.listeners.get('message') ?? []) listener(new MessageEvent('message', { data }));
  }

  /** Worker の中で例外が起きたことを知らせます。 */
  fail(message: string) {
    for (const listener of this.listeners.get('error') ?? []) listener(new ErrorEvent('error', { message }));
  }
}

/** 管理人と、その証言の2つのノードを持つグラフです。 */
const caretakerGraph: CaseGraph = {
  nodes: [
    { id: 'person:person-caretaker', kind: 'person', label: '管理人', entityId: 'person-caretaker' },
    { id: 'claim:claim-caretaker', kind: 'claim', label: '夜7時に見回りをした', entityId: 'claim-caretaker' },
  ],
  edges: [{ id: 'speaks:claim-caretaker', kind: 'speaks', sourceId: 'person:person-caretaker', targetId: 'claim:claim-caretaker' }],
};

/** Worker が返す配置です。 */
const caretakerLayout: GraphLayout = {
  nodes: [
    { ...caretakerGraph.nodes[0]!, x: -80, y: 0 },
    { ...caretakerGraph.nodes[1]!, x: 80, y: 0 },
  ],
  edges: [],
  viewBox: { x: -152, y: -72, width: 304, height: 144 },
};

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestGraphLayout', () => {
  it('グラフを Worker に渡し、Worker が返した配置で解決したうえで、Worker を終了する', async () => {
    const result = requestGraphLayout(caretakerGraph, new AbortController().signal);
    const worker = FakeWorker.instances[0]!;

    // 検証: グラフをそのまま Worker に渡す
    expect(worker.received).toEqual([caretakerGraph]);
    worker.reply(caretakerLayout);

    // 検証: 返事の配置で解決し、使い終わった Worker を残さない
    await expect(result).resolves.toEqual(caretakerLayout);
    expect(worker.terminated).toBe(true);
  });

  it('計算の途中で中断すると、Worker を終了し、中断のエラーで失敗する', async () => {
    // 前提: グラフを開いたまま絞り込みを変えるなどして、計算中の配置が要らなくなった
    const controller = new AbortController();
    const result = requestGraphLayout(caretakerGraph, controller.signal);
    const worker = FakeWorker.instances[0]!;

    controller.abort();

    // 検証: 要らなくなった計算を止め、呼び出し元が中断と見分けられるエラーで失敗する
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });

  it('すでに中断している場合は、Worker を作らずに中断のエラーで失敗する', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(requestGraphLayout(caretakerGraph, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('Worker の中で計算に失敗すると、その内容を含むエラーで失敗し、Worker を終了する', async () => {
    const result = requestGraphLayout(caretakerGraph, new AbortController().signal);
    const worker = FakeWorker.instances[0]!;

    worker.fail('ノードの座標が決まりませんでした: claim:claim-caretaker');

    await expect(result).rejects.toThrow('ノードの座標が決まりませんでした: claim:claim-caretaker');
    expect(worker.terminated).toBe(true);
  });
});
