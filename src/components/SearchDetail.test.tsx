/**
 * ボード全体の検索結果（証言・人物・場所を横断した検索と、詳細への導線）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { SearchDetail } from './SearchDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 検索結果のページのURLです。 */
function 検索結果のURL(検索語: string, tab?: string): string {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  params.set('q', 検索語);
  return `/cases/case-lakeside/search?${params.toString()}`;
}

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
});

describe('SearchDetail', () => {
  it('証言・人物・場所を横断して検索し、それぞれの詳細へのリンクを、開いているタブを引き継いで並べる', () => {
    resetMockNavigation(検索結果のURL('管理人', 'map'));
    render(<SearchDetail />);

    expect(screen.getByRole('heading', { name: '「管理人」の検索結果' })).toBeInTheDocument();

    // 前提: 管理人は、自身の証言の発言者であり、ユーザーの推測の本文で言及されている
    const 証言 = screen.getByRole('region', { name: '証言' });
    expect(within(証言).getByRole('link', { name: /管理人の証言は事件の20年後/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-user-guess?tab=map'
    );

    const 人物 = screen.getByRole('region', { name: '人物' });
    expect(within(人物).getByRole('link', { name: /管理人/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-caretaker?tab=map'
    );
    expect(within(人物).getByRole('link', { name: /管理人/ })).toHaveTextContent('名前・別名');

    expect(screen.queryByRole('region', { name: '場所' })).not.toBeInTheDocument();
  });

  it('場所の名前に一致した場合は、場所の詳細へのリンクを並べる', () => {
    resetMockNavigation(検索結果のURL('湖畔の別荘'));
    render(<SearchDetail />);

    const 場所 = screen.getByRole('region', { name: '場所' });
    expect(within(場所).getByRole('link', { name: /湖畔の別荘/ })).toHaveAttribute('href', '/cases/case-lakeside/places/place-villa');
  });

  it('識別子の値で検索すると、表記の違う値を持つ人物をたどれる', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner' ? { ...person, identifiers: [{ type: '電話番号', value: '090-1234-5678' }] } : person
      ),
    };
    openTestCase(ケース);
    resetMockNavigation(検索結果のURL('０９０１２３４５６７８'));
    render(<SearchDetail />);

    const 人物 = screen.getByRole('region', { name: '人物' });
    expect(within(人物).getByRole('link', { name: /別荘の持ち主/ })).toHaveTextContent('識別子');
  });

  it('一致するものが無い場合は、見つからないことを示す', () => {
    resetMockNavigation(検索結果のURL('存在しない語句'));
    render(<SearchDetail />);

    expect(screen.getByText('一致する証言・人物・場所はありません。')).toBeInTheDocument();
  });

  it('詳細を閉じて、ボードの元の表示に戻るリンクを置く', () => {
    resetMockNavigation(検索結果のURL('管理人', 'map'));
    render(<SearchDetail />);

    expect(screen.getByRole('link', { name: '検索結果を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
  });
});
