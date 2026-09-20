/**
 * 時系列ビューと証言者別ビューの表示のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Claim } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
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

  it('主張も出来事も1件も無い場合は、書き始め方の案内を表示する', () => {
    render(<TimelineView target={{ ...sampleFictionalCase, events: [], claims: [], relationships: [] }} />);

    expect(screen.getByText('まだ何も書かれていません。「ボードに書き足す」から書き始めてください。')).toBeInTheDocument();
  });
});

/** ストアの案件を時系列ボードに表示します。ボードへの書き足しがストアを通じて画面に反映されることを検証するために使います。 */
function StoreBoard({ onOpenEntity }: { onOpenEntity?: (kind: string, id: string) => void }) {
  const currentCase = useCaseStore((state) => state.currentCase);
  return <TimelineView target={currentCase} onOpenEntity={onOpenEntity} />;
}

/** 警察の捜索（8月15日）についての、出来事に束ねていない主張です。 */
const 捜索の記述: Claim = {
  id: 'claim-police-search',
  speaker: { kind: 'source' },
  sourceId: 'source-newspaper',
  content: '警察が別荘を捜索した。 @[架空日報 朝刊](source:source-newspaper)',
  mentionedPersonIds: [],
  when: { text: '8月15日', earliest: '1998-08-15' },
  assessment: 'unverified',
};

describe('TimelineView への書き足し', () => {
  beforeEach(() => {
    useCaseStore.getState().replaceCase({ ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 捜索の記述] });
  });

  it('出来事の束の中に書き足すと、その出来事に束ねた主張としてボードに現れる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: '「持ち主が最後に目撃された」に書き足す' }));
    await user.type(screen.getByLabelText('内容'), '別荘の電話は12日の夜から不通だった。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const entry = screen.getByRole('article', { name: '持ち主が最後に目撃された' });
    expect(within(entry).getByText(/別荘の電話は12日の夜から不通だった。/)).toBeInTheDocument();
    // 保存後は入力欄を閉じる
    expect(screen.queryByLabelText('内容')).not.toBeInTheDocument();
  });

  it('項目と項目の間に書き足すと、前後から求めた日時を持つ主張として、その位置に現れる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: '「8月12日 夜7時」と「8月15日」の間に書き足す' }));
    await user.type(screen.getByLabelText('内容'), '別荘の前に見慣れない車が停まっていた。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(useCaseStore.getState().currentCase.claims.at(-1)).toMatchObject({
      when: { text: '「8月12日 夜7時」から「8月15日」の間', earliest: '1998-08-12T19:00', latest: '1998-08-15' },
    });
    const 時系列 = screen.getByRole('list', { name: '時系列' });
    const 本文の並び = within(時系列)
      .getAllByText(/夜7時に見回り|見慣れない車|警察が別荘を捜索した/)
      .map((element) => element.textContent);
    expect(本文の並び).toEqual([
      expect.stringContaining('夜7時に見回り'),
      expect.stringContaining('見慣れない車'),
      expect.stringContaining('警察が別荘を捜索した'),
    ]);
  });

  it('位置を決めずに書き足した主張は、日時を入れなければ時期不明の枠に現れる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '持ち主の交友関係を調べたい。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const 時期不明 = screen.getByRole('region', { name: '時期不明' });
    expect(within(時期不明).getByText('持ち主の交友関係を調べたい。')).toBeInTheDocument();
  });

  it('「やめる」で、保存せずに入力欄を閉じる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);
    const 件数 = useCaseStore.getState().currentCase.claims.length;

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '書きかけの文章');
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(screen.queryByLabelText('内容')).not.toBeInTheDocument();
    expect(useCaseStore.getState().currentCase.claims).toHaveLength(件数);
  });

  it('ボード上の主張を、その場で編集できる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    const 捜索 = screen.getByText(/警察が別荘を捜索した。/).closest('li')!;
    await user.click(within(捜索).getByRole('button', { name: 'この主張を編集' }));
    await user.type(screen.getByLabelText('内容'), ' 捜索は半日で終わった。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByText(/捜索は半日で終わった。/)).toBeInTheDocument();
    expect(useCaseStore.getState().currentCase.claims.filter((claim) => claim.id === 'claim-police-search')).toHaveLength(1);
  });

  it('編集中の主張を削除できる', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StoreBoard />);

    const 捜索 = screen.getByText(/警察が別荘を捜索した。/).closest('li')!;
    await user.click(within(捜索).getByRole('button', { name: 'この主張を編集' }));
    await user.click(screen.getByRole('button', { name: 'この主張を削除' }));

    expect(screen.queryByText(/警察が別荘を捜索した。/)).not.toBeInTheDocument();
  });

  it('関係の根拠になっている主張を削除しようとすると、理由を示して削除しない', async () => {
    // 前提: 管理人の証言（claim-caretaker）は、関係「雇用主」の根拠になっている
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StoreBoard />);

    const 管理人の証言 = screen.getByText(/夜7時に見回りをしたとき/).closest('li')!;
    await user.click(within(管理人の証言).getByRole('button', { name: 'この主張を編集' }));
    await user.click(screen.getByRole('button', { name: 'この主張を削除' }));

    expect(screen.getByRole('alert')).toHaveTextContent('他のデータから参照されているため削除できません');
  });

  it('本文のメンションや出来事の見出しから、エンティティの編集を開く', async () => {
    const user = userEvent.setup();
    const onOpenEntity = vi.fn();
    render(<StoreBoard onOpenEntity={onOpenEntity} />);

    const 隣家の証言 = screen.getByText(/夜9時ごろ、/).closest('li')!;
    await user.click(within(隣家の証言).getByRole('button', { name: '@湖畔の別荘' }));
    expect(onOpenEntity).toHaveBeenLastCalledWith('place', 'place-villa');

    await user.click(screen.getByRole('button', { name: '「持ち主が最後に目撃された」を編集' }));
    expect(onOpenEntity).toHaveBeenLastCalledWith('event', 'event-last-seen');
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

    expect(screen.getByText('主張がまだ登録されていません。時系列のボードから書き足してください。')).toBeInTheDocument();
  });
});
