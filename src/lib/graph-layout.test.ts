/**
 * グラフビューのノードの配置を計算するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildCaseGraph } from '@/domain/case-graph';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { layoutGraph, NODE_RADIUS, shortLabelOf } from './graph-layout';

/** 人物も証言も持たない、空のケースです。 */
const 空のケース: Case = { id: 'case-empty', name: '空のケース', persons: [], places: [], claims: [], relationships: [], timelineOrder: [] };

describe('layoutGraph', () => {
  it('すべてのノードに座標を与える', () => {
    const 配置 = layoutGraph(buildCaseGraph(sampleFictionalCase));

    expect(配置.nodes).toHaveLength(buildCaseGraph(sampleFictionalCase).nodes.length);
    for (const node of 配置.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it('同じケースからは、毎回同じ配置を返す', () => {
    // 前提: 開き直すたびに図の形が変わると、どこに何があったかを覚えられないため、配置は決定的にする
    const 一度目 = layoutGraph(buildCaseGraph(sampleFictionalCase));
    const 二度目 = layoutGraph(buildCaseGraph(sampleFictionalCase));

    expect(二度目.nodes.map((node) => [node.id, node.x, node.y])).toEqual(一度目.nodes.map((node) => [node.id, node.x, node.y]));
  });

  it('ノード同士を重ねない', () => {
    const 配置 = layoutGraph(buildCaseGraph(sampleFictionalCase));

    for (const a of 配置.nodes) {
      for (const b of 配置.nodes) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_RADIUS[a.kind]);
      }
    }
  });

  it('エッジの両端を、配置済みのノードとして解決する', () => {
    const 配置 = layoutGraph(buildCaseGraph(sampleFictionalCase));

    const 発言のエッジ = 配置.edges.find((edge) => edge.kind === 'speaks');
    expect(発言のエッジ?.source.id).toBe(発言のエッジ?.sourceId);
    expect(発言のエッジ?.target.id).toBe(発言のエッジ?.targetId);
  });

  it('すべてのノードが収まる表示範囲（viewBox）を返す', () => {
    const 配置 = layoutGraph(buildCaseGraph(sampleFictionalCase));
    const { x, y, width, height } = 配置.viewBox;

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    for (const node of 配置.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(x);
      expect(node.x).toBeLessThanOrEqual(x + width);
      expect(node.y).toBeGreaterThanOrEqual(y);
      expect(node.y).toBeLessThanOrEqual(y + height);
    }
  });

  it('ノードが1つも無いケースでも、幅と高さのある表示範囲を返す', () => {
    // 前提: 幅または高さが0のviewBoxを渡すと、SVGは何も描画しない
    const 配置 = layoutGraph(buildCaseGraph(空のケース));

    expect(配置.nodes).toEqual([]);
    expect(配置.viewBox.width).toBeGreaterThan(0);
    expect(配置.viewBox.height).toBeGreaterThan(0);
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
