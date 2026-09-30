/**
 * グラフビューのノードの配置を計算するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildCaseGraph } from '@/domain/case-graph';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { layoutGraph, NODE_RADIUS, shortLabelOf } from './graph-layout';

/** 人物も証言も持たない、空のケースです。 */
const emptyCase: Case = { id: 'case-empty', name: '空のケース', persons: [], places: [], claims: [], relationships: [], interviews: [], crossChecks: [], hypotheses: [], tasks: [], timelineOrder: [], personLaneOrder: [] };

describe('layoutGraph', () => {
  it('すべてのノードに座標を与える', () => {
    const layout = layoutGraph(buildCaseGraph(sampleFictionalCase));

    expect(layout.nodes).toHaveLength(buildCaseGraph(sampleFictionalCase).nodes.length);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it('同じケースからは、毎回同じ配置を返す', () => {
    // 前提: 開き直すたびに図の形が変わると、どこに何があったかを覚えられないため、配置は決定的にする
    const firstTime = layoutGraph(buildCaseGraph(sampleFictionalCase));
    const secondTime = layoutGraph(buildCaseGraph(sampleFictionalCase));

    expect(secondTime.nodes.map((node) => [node.id, node.x, node.y])).toEqual(firstTime.nodes.map((node) => [node.id, node.x, node.y]));
  });

  it('ノード同士を重ねない', () => {
    const layout = layoutGraph(buildCaseGraph(sampleFictionalCase));

    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_RADIUS[a.kind]);
      }
    }
  });

  it('エッジの両端を、配置済みのノードとして解決する', () => {
    const layout = layoutGraph(buildCaseGraph(sampleFictionalCase));

    const statementEdge = layout.edges.find((edge) => edge.kind === 'speaks');
    expect(statementEdge?.source.id).toBe(statementEdge?.sourceId);
    expect(statementEdge?.target.id).toBe(statementEdge?.targetId);
  });

  it('すべてのノードが収まる表示範囲（viewBox）を返す', () => {
    const layout = layoutGraph(buildCaseGraph(sampleFictionalCase));
    const { x, y, width, height } = layout.viewBox;

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(x);
      expect(node.x).toBeLessThanOrEqual(x + width);
      expect(node.y).toBeGreaterThanOrEqual(y);
      expect(node.y).toBeLessThanOrEqual(y + height);
    }
  });

  it('ノードが1つも無いケースでも、幅と高さのある表示範囲を返す', () => {
    // 前提: 幅または高さが0のviewBoxを渡すと、SVGは何も描画しない
    const layout = layoutGraph(buildCaseGraph(emptyCase));

    expect(layout.nodes).toEqual([]);
    expect(layout.viewBox.width).toBeGreaterThan(0);
    expect(layout.viewBox.height).toBeGreaterThan(0);
  });
});

describe('shortLabelOf', () => {
  it('規定の文字数を超える名前は、末尾を省略する', () => {
    expect(shortLabelOf('湖畔の夏 20年目の証言（架空の書籍）')).toBe('湖畔の夏 20年目の…');
  });

  it('規定の文字数に収まる名前は、そのまま返す', () => {
    expect(shortLabelOf('県道の防犯カメラ')).toBe('県道の防犯カメラ');
  });
});
