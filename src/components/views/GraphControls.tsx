/**
 * グラフビューの操作パネル
 *
 * 図そのもの（GraphView が描くSVG）に対する操作を、図の外にまとめます。次の3つを担います。
 *
 * - 拡大・縮小・表示を戻す: 図に重ねたボタンです。図を見ながら押せるよう、SVGの右上に重ねて置きます
 * - 絞り込み: 人物・証言・関係のうち、図に描くものを選ぶチェックボックスです
 * - 凡例: 線の種類（発言・経由・言及・関係）の読み方です
 *
 * 状態は持たず、いまの値と、変更を伝える関数を受け取ります。図の状態はすべて GraphView が持ち、
 * 拡大縮小と絞り込みで図の見え方が食い違わないようにするためです。
 */
'use client';

import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useId } from 'react';
import type { GraphEdgeKind } from '@/domain/case-graph';
import type { GraphFilter } from '@/lib/graph-display';
import { Button } from '@/components/ui/button';

/** エッジの種類ごとの、線の色です。凡例と図の両方で同じ値を使います。 */
export const EDGE_CLASSES: Record<GraphEdgeKind, string> = {
  speaks: 'stroke-foreground/70',
  via: 'stroke-foreground/50',
  mentions: 'stroke-foreground/35',
  // 関係は人物どうしを結ぶため、人物のメンションと同じ色を使い、証言から導いた線と区別する
  relates: 'stroke-mention-person-foreground',
};

/** エッジの種類ごとの、破線の形です。値を持たない種類は実線です。 */
export const EDGE_DASH_ARRAYS: Partial<Record<GraphEdgeKind, string>> = {
  via: '7 4',
  mentions: '1 5',
};

/** 根拠の証言が登録されていない関係の、破線の形です。 */
export const NO_BASIS_DASH_ARRAY = '5 4';

/** 凡例の1行です。関係は、根拠の有無で線が変わるため2行に分けます。 */
type LegendItem = { key: string; label: string; description: string; className: string; dashArray?: string };

/** 証言から導いた線の凡例です。証言を中心に、発言・経由・言及の順で読めるようにします。 */
const CLAIM_LEGEND_ITEMS: LegendItem[] = [
  { key: 'speaks', label: '発言', description: '発言者から証言へ', className: EDGE_CLASSES.speaks },
  { key: 'via', label: '経由', description: '証言が伝わった経路', className: EDGE_CLASSES.via, dashArray: EDGE_DASH_ARRAYS.via },
  {
    key: 'mentions',
    label: '言及',
    description: '証言から、その証言が言及している人物へ',
    className: EDGE_CLASSES.mentions,
    dashArray: EDGE_DASH_ARRAYS.mentions,
  },
];

/** 関係の線の凡例です。「関係を表示」を外している間は並べません。 */
const RELATION_LEGEND_ITEMS: LegendItem[] = [
  { key: 'relates', label: '関係', description: '人物どうしの関係（矢印は片方向の関係）', className: EDGE_CLASSES.relates },
  {
    key: 'relates-no-basis',
    label: '関係（根拠未登録）',
    description: '根拠の証言がまだ登録されていない関係',
    className: EDGE_CLASSES.relates,
    dashArray: NO_BASIS_DASH_ARRAY,
  },
];

/** 絞り込みのチェックボックス1つぶんの定義です。 */
const FILTER_ITEMS: { key: keyof GraphFilter; label: string }[] = [
  { key: 'persons', label: '人物を表示' },
  { key: 'claims', label: '証言を表示' },
  { key: 'relations', label: '関係を表示' },
];

/** 倍率を百分率の文字列にします。図の全体が収まる状態を100%とします。 */
function zoomTextOf(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

type GraphZoomButtonsProps = {
  /** 図の全体を表示した状態を1としたときの、いまの倍率です。 */
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

/** 図に重ねて置く、拡大・縮小・表示を戻すのボタンです。 */
export function GraphZoomButtons({ zoom, onZoomIn, onZoomOut, onReset }: GraphZoomButtonsProps) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm">
      <span className="px-1 text-xs tabular-nums text-muted-foreground">{zoomTextOf(zoom)}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="縮小" onClick={onZoomOut}>
        <ZoomOut />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="拡大" onClick={onZoomIn}>
        <ZoomIn />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="表示を戻す" onClick={onReset}>
        <Maximize2 />
      </Button>
    </div>
  );
}

type GraphFilterControlsProps = {
  filter: GraphFilter;
  onFilterChange: (filter: GraphFilter) => void;
};

/** 図に描くもの（人物・証言・関係）を選ぶチェックボックスです。 */
export function GraphFilterControls({ filter, onFilterChange }: GraphFilterControlsProps) {
  const idPrefix = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {FILTER_ITEMS.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <input
            id={`${idPrefix}-${item.key}`}
            type="checkbox"
            checked={filter[item.key]}
            onChange={(event) => onFilterChange({ ...filter, [item.key]: event.target.checked })}
          />
          <label htmlFor={`${idPrefix}-${item.key}`} className="text-muted-foreground">
            {item.label}
          </label>
        </div>
      ))}
    </div>
  );
}

/** 線の種類の読み方を並べた凡例です。関係を隠している間は、関係の行を並べません。 */
export function GraphLegend({ showsRelations }: { showsRelations: boolean }) {
  const items = showsRelations ? [...CLAIM_LEGEND_ITEMS, ...RELATION_LEGEND_ITEMS] : CLAIM_LEGEND_ITEMS;
  return (
    <ul aria-label="線の見方" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className="shrink-0">
            <line x1="0" y1="4" x2="28" y2="4" strokeWidth={1.5} strokeDasharray={item.dashArray} className={item.className} />
          </svg>
          <span className="font-medium text-foreground">{item.label}</span>
          <span>{item.description}</span>
        </li>
      ))}
    </ul>
  );
}
