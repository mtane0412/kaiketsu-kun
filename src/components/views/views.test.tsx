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
  it('出来事の束に、束ねた主張から導出した日時・場所・人物と、束ねた主張を表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const entry = screen.getByRole('article', { name: '持ち主が最後に目撃された' });
    // 見出しの日時は、束ねた主張が述べる日時のうち最も早いもの（管理人の「夜7時」）
    expect(entry.querySelector('header')).toHaveTextContent('8月12日 夜7時');
    expect(entry.querySelector('header')).toHaveTextContent('湖畔の別荘 ／ 別荘の持ち主');
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

  it('同じ出来事に束ねた他の主張と時刻が食い違う主張に、食い違いの表示を付ける', () => {
    // 前提: 管理人は「夜7時」、隣家の住人は「夜9時ごろ」と述べている。架空日報の記述は日時を述べていない
    render(<TimelineView target={sampleFictionalCase} />);

    const 管理人の証言 = screen.getByText(/夜7時に見回りをしたとき/).closest('li');
    const 隣家の証言 = screen.getByText(/夜9時ごろ、/).closest('li');
    const 架空日報の記述 = screen.getByText(/連絡が取れなくなっている/).closest('li');

    expect(within(管理人の証言!).getByText('他の主張と時刻が食い違う')).toBeInTheDocument();
    expect(within(隣家の証言!).getByText('他の主張と時刻が食い違う')).toBeInTheDocument();
    expect(within(架空日報の記述!).queryByText('他の主張と時刻が食い違う')).not.toBeInTheDocument();
  });

  it('出来事に束ねていない主張も、述べる日時があれば時系列に並べる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-police-search',
          speaker: { kind: 'source' },
          sourceId: 'source-newspaper',
          content: '警察が別荘を捜索した。',
          mentionedPersonIds: [],
          when: { text: '8月15日', earliest: '1998-08-15' },
          assessment: 'unverified',
        },
      ],
    };
    render(<TimelineView target={案件} />);

    const 時系列 = screen.getByRole('list', { name: '時系列' });
    expect(within(時系列).getByText('警察が別荘を捜索した。')).toBeInTheDocument();
  });

  it('日時を述べる主張が無い項目を、時期不明の枠に表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const section = screen.getByRole('region', { name: '時期不明' });
    expect(within(section).getByText(/金銭の問題があった可能性/)).toBeInTheDocument();
  });

  it('主張も出来事も1件も無い場合は、案内を表示する', () => {
    render(<TimelineView target={{ ...sampleFictionalCase, events: [], claims: [], relationships: [] }} />);

    expect(screen.getByText('主張がまだ登録されていません。「入力」タブから登録してください。')).toBeInTheDocument();
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
