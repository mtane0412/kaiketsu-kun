/**
 * 時系列ビューと証言者別ビューの表示のテスト
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { SpeakerView } from './SpeakerView';
import { TimelineView } from './TimelineView';

describe('TimelineView', () => {
  it('出来事の見立て（日時・場所・関与人物）と、その出来事についての主張を表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const entry = screen.getByRole('article', { name: '持ち主が最後に目撃された' });
    expect(within(entry).getByText('1998年8月12日の夜')).toBeInTheDocument();
    expect(within(entry).getByText(/夜9時ごろ、/)).toBeInTheDocument();
    expect(within(entry).getByText(/夜7時に見回りをしたとき/)).toBeInTheDocument();
  });

  it('本文のメンションは、トークンの記法ではなくエンティティの現在の名前で表示する', () => {
    // 前提: 本文のトークンが控えている表示名は「別荘の持ち主」だが、人物はその後「湖畔荘のオーナー」に改名されている
    const 案件: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner' ? { ...person, name: '湖畔荘のオーナー' } : person
      ),
    };
    render(<TimelineView target={案件} />);

    const 隣家の証言 = screen.getByText(/夜9時ごろ、/).closest('li')!;
    expect(隣家の証言).toHaveTextContent('夜9時ごろ、@湖畔の別荘の明かりがついていて、庭に@湖畔荘のオーナーの姿が見えた。');
    expect(隣家の証言).not.toHaveTextContent('person:person-owner');
  });

  it('見立てと食い違う時刻を述べている主張に、食い違いの表示を付ける', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      events: sampleFictionalCase.events.map((event) => ({
        ...event,
        when: { text: '夜8時以降', earliest: '1998-08-12T20:00', latest: '1998-08-12T23:59' },
      })),
    };
    render(<TimelineView target={案件} />);

    const 管理人の証言 = screen.getByText(/夜7時に見回りをしたとき/).closest('li');
    const 隣家の証言 = screen.getByText(/夜9時ごろ、/).closest('li');

    expect(within(管理人の証言!).getByText('時刻が見立てと食い違う')).toBeInTheDocument();
    expect(within(隣家の証言!).queryByText('時刻が見立てと食い違う')).not.toBeInTheDocument();
  });

  it('出来事に紐づかない主張を別枠に表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const section = screen.getByRole('region', { name: '出来事に紐づかない主張' });
    expect(within(section).getByText(/金銭の問題があった可能性/)).toBeInTheDocument();
  });

  it('出来事が1件も無い場合は、案内を表示する', () => {
    render(<TimelineView target={{ ...sampleFictionalCase, events: [], claims: [] }} />);

    expect(screen.getByText('出来事がまだ登録されていません。「入力」タブから登録してください。')).toBeInTheDocument();
  });
});

describe('SpeakerView', () => {
  it('発言者ごとに主張をまとめ、ユーザーの推測を区別して表示する', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 管理人 = screen.getByRole('region', { name: '管理人' });
    expect(within(管理人).getByText(/夜7時に見回りをしたとき/)).toBeInTheDocument();
    // 本文のメンション（「@」で始まる）ではなく、ソース欄の表示を検証する
    expect(within(管理人).getByText(/^湖畔の夏 20年目の証言/)).toBeInTheDocument();

    const 推測 = screen.getByRole('region', { name: 'ユーザーの推測' });
    expect(within(推測).getByText(/金銭の問題があった可能性/)).toBeInTheDocument();
  });

  it('主張が1件も無い場合は、案内を表示する', () => {
    render(<SpeakerView target={{ ...sampleFictionalCase, claims: [], relationships: [] }} />);

    expect(screen.getByText('主張がまだ登録されていません。「入力」タブから登録してください。')).toBeInTheDocument();
  });
});
