/**
 * グラフの配置を計算する Web Worker
 *
 * メインスレッド（src/lib/graph-layout-request.ts）から受け取ったグラフの配置を計算し、結果を1度だけ返します。
 * 計算に失敗した場合は例外をそのまま投げ、Worker の error イベントとしてメインスレッドへ知らせます。
 */
import type { CaseGraph } from '@/domain/case-graph';
import { layoutGraph } from './graph-layout';

self.addEventListener('message', (event: MessageEvent<CaseGraph>) => {
  self.postMessage(layoutGraph(event.data));
});
