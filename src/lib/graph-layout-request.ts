/**
 * グラフの配置の計算（src/lib/graph-layout.ts の layoutGraph）を、Web Worker に頼む処理
 *
 * 証言が1万件近いケースでは、配置の計算に10秒以上かかります。メインスレッドで計算すると、その間は画面が固まり、
 * スクロールもタブの切り替えもできなくなるため、計算を Web Worker（src/lib/graph-layout.worker.ts）へ移します（#127）。
 * 計算の中身は変えないため、同じケースからは、メインスレッドで計算した場合と同じ配置が得られます。
 *
 * 計算1回ごとに Worker を作り、結果を受け取るか中断したら終了します。計算中の Worker は、中断しない限り止められないためです。
 * 注意: 配置のエッジの両端（source・target）はノードと同じオブジェクトを指します。Worker から受け取るときの構造化複製は、
 * 1つのメッセージの中で同じオブジェクトを指す参照を保つため、受け取った後もエッジの両端はノードと同じオブジェクトを指します。
 */
import type { CaseGraph } from '@/domain/case-graph';
import type { GraphLayout } from './graph-layout';

/**
 * グラフの配置を Web Worker で計算します。
 *
 * @param signal 中断すると、Worker を終了し、AbortError（DOMException）で失敗します。計算中にグラフが変わったときに使います。
 * @returns 配置の計算結果です。Worker の中で計算に失敗した場合は、その内容を含むエラーで失敗します。
 */
export function requestGraphLayout(graph: CaseGraph, signal: AbortSignal): Promise<GraphLayout> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(new URL('./graph-layout.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener('abort', handleAbort);
    };
    const handleAbort = () => {
      finish();
      reject(signal.reason);
    };
    signal.addEventListener('abort', handleAbort);
    worker.addEventListener('message', (event: MessageEvent<GraphLayout>) => {
      finish();
      resolve(event.data);
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      finish();
      reject(new Error(`グラフの配置を計算できませんでした: ${event.message}`));
    });
    worker.postMessage(graph);
  });
}
