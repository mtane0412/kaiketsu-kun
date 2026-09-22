/**
 * グラフビュー（人物と証言のつながりを図で表す表示）のテスト
 */
import { render, screen, within } from '@testing-library/react';
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
