/**
 * 時系列ビューと証言者別ビューの表示のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Claim } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { resetMockNavigation } from '@/test/mock-navigation';
import { openedCase, openTestCase } from '@/test/open-case';
import { PersonLaneView } from './PersonLaneView';
import { SpeakerView } from './SpeakerView';
import { TimelineView } from './TimelineView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

/** 見出し（要約）を付けた、長文の証言です。 */
const 見出し付きの記述: Claim = {
  id: 'claim-extortion',
  speaker: { kind: 'person', personIds: ['person-newspaper'] },
  viaPersonIds: [],
  title: 'Zによる恐喝事件があった',
  content: 'Zは被害者の自宅を訪れ、現金を渡すよう繰り返し迫った。被害者は数回にわたって現金を渡したという。',
  mentionedPersonIds: [],
};

describe('TimelineView', () => {
  it('証言を、ケースの並び順のとおりに並べ、述べる日時を持つ証言にはカードの上に日時を示す', () => {
    // 前提: サンプルの並びは、管理人（夜7時）→ 防犯カメラ（夜8時10分ごろ）→ 隣家の住人（夜9時ごろ）→ 架空日報 → ユーザーの推測
    render(<TimelineView target={sampleFictionalCase} />);

    const 時系列 = screen.getByRole('list', { name: '時系列' });
    const 本文の並び = within(時系列)
      .getAllByText(/見回りをしたとき|車が別荘の方向へ走る|明かりがついていて|連絡が取れなくなっている|金銭の問題があった可能性/)
      .map((element) => element.textContent);
    expect(本文の並び).toEqual([
      expect.stringContaining('見回りをしたとき'),
      expect.stringContaining('車が別荘の方向へ走る'),
      expect.stringContaining('明かりがついていて'),
      expect.stringContaining('連絡が取れなくなっている'),
      expect.stringContaining('金銭の問題があった可能性'),
    ]);
    expect(within(時系列).getAllByText('1998年8月12日 19:00').length).toBeGreaterThan(0);
  });

  it('照合を持つ証言のカードに、照合の件数を種類別に小さく示す', () => {
    // 前提: 隣家の住人の証言は、裏付ける照合1件と食い違う照合1件を持ち、ユーザーの推測は照合を持たない
    render(<TimelineView target={sampleFictionalCase} />);

    const 隣家の住人のカード = screen.getByText(/明かりがついていて/).closest('li');
    expect(隣家の住人のカード).not.toBeNull();
    expect(within(隣家の住人のカード!).getByText('照合')).toBeInTheDocument();
    expect(within(隣家の住人のカード!).getByText('裏付け1・食い違い1')).toBeInTheDocument();

    const 推測のカード = screen.getByText(/金銭の問題があった可能性/).closest('li');
    expect(within(推測のカード!).queryByText('照合')).not.toBeInTheDocument();
  });

  it('出来事の束を表示しない（語られる出来事は、すべて誰かの証言として並べる）', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText(/この出来事に書き足す/)).not.toBeInTheDocument();
  });

  it('証言に「信頼できる」「疑わしい」「未検証」といった真偽の評価を表示しない', () => {
    // 誰が述べたかを示すだけに留め、内容が真実かどうかのラベルは付けない
    render(<TimelineView target={sampleFictionalCase} />);

    expect(screen.queryByText('信頼できる')).not.toBeInTheDocument();
    expect(screen.queryByText('疑わしい')).not.toBeInTheDocument();
    expect(screen.queryByText('未検証')).not.toBeInTheDocument();
  });

  it('本文のメンションは、トークンの記法ではなくエンティティの現在の名前で表示する', () => {
    // 前提: 本文のトークンが控えている表示名は「別荘の持ち主」だが、人物はその後「湖畔荘のオーナー」に改名されている
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner' ? { ...person, name: '湖畔荘のオーナー' } : person
      ),
    };
    render(<TimelineView target={ケース} />);

    const 隣家の証言 = screen.getByText(/明かりがついていて/).closest('li')!;
    expect(隣家の証言).toHaveTextContent(
      '@1998年8月12日 21:00ごろ、@湖畔の別荘の明かりがついていて、庭に@湖畔荘のオーナーの姿が見えた。'
    );
    expect(隣家の証言).not.toHaveTextContent('person:person-owner');
  });

  it('証言同士の食い違いは判定せず、食い違いの表示を付けない', () => {
    // 前提: 管理人は「夜7時」、隣家の住人は「夜9時ごろ」と述べている。見比べて判断するのは読み手
    render(<TimelineView target={sampleFictionalCase} />);

    expect(screen.queryByText(/食い違う$/)).not.toBeInTheDocument();
  });

  it('日時を述べる証言が無い項目も同じ時系列に並べ、「時期不明」の枠は表示しない', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const 時系列 = screen.getByRole('list', { name: '時系列' });
    expect(within(時系列).getByText(/金銭の問題があった可能性/)).toBeInTheDocument();
    expect(screen.queryByText('時期不明')).not.toBeInTheDocument();
  });

  it('ボードの項目ごとに、ドラッグで動かすためのつまみを表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    // 見出しの無い証言は、本文の冒頭20文字を名前にする
    expect(screen.getByRole('button', { name: '「@管理人の証言は事件の20年後に初めて出…」を動かす' })).toBeInTheDocument();
  });

  it('つまみは、環境のフォントに左右される文字ではなく、アイコンで描く', () => {
    // 前提: 以前のつまみは点字の記号（⠿ U+283F）1文字だったため、表示される形が環境のフォントに左右されていた
    render(<TimelineView target={sampleFictionalCase} />);

    const つまみ = screen.getByRole('button', { name: '「@管理人の証言は事件の20年後に初めて出…」を動かす' });
    expect(つまみ.querySelector('svg')).toBeInTheDocument();
    expect(つまみ).not.toHaveTextContent('⠿');
  });

  it('つまみはカードと同じ行に並べ、日時はその行の上に置く', () => {
    // 前提: つまみをカードと同じ高さの帯にするため、日時（カードの上に出る行）は帯の外に置く
    render(<TimelineView target={sampleFictionalCase} />);

    // 「1998年8月12日 19:00」の日時を持つ、管理人の証言で確かめる
    const 項目 = screen.getAllByText('1998年8月12日 19:00')[0]!.closest('li')!;
    const つまみ = within(項目).getByRole('button', { name: /を動かす$/ });
    const 行 = つまみ.parentElement!;
    // 検証: つまみと同じ行にはカードだけがあり、日時は含まれない
    expect(within(行).getByText(/見回りをしたとき/)).toBeInTheDocument();
    expect(within(行).queryByText('1998年8月12日 19:00')).not.toBeInTheDocument();
    expect(within(項目).getByText('1998年8月12日 19:00')).toBeInTheDocument();
  });

  it('つまみにカーソルを乗せると、マウスとキーボードの両方の動かし方が分かる', () => {
    // 検証: 読み上げにしか届かない aria-label とは別に、マウスの利用者にも操作方法を示す
    render(<TimelineView target={sampleFictionalCase} />);

    const つまみ = screen.getByRole('button', { name: '「@管理人の証言は事件の20年後に初めて出…」を動かす' });
    expect(つまみ).toHaveAttribute('title', 'ドラッグ、またはスペースキーを押してから矢印キーで動かします');
  });

  it('見出しのある証言は、見出しを表示し、本文は折りたたんで示す', () => {
    // 前提: 長い本文に、要約としての見出しを付けている
    const ケース: Case = { ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 見出し付きの記述] };
    render(<TimelineView target={ケース} />);

    const 証言 = screen.getByText('Zによる恐喝事件があった').closest('li')!;
    const 本文 = within(証言).getByText(/現金を渡すよう繰り返し迫った/);
    // 検証: 本文は「本文を表示」を開くまで閉じている
    expect(within(証言).getByText('本文を表示')).toBeInTheDocument();
    expect(本文.closest('details')).not.toHaveAttribute('open');
  });

  it('見出しの無い証言は、本文を折りたたまずに表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const 本文 = screen.getByText(/明かりがついていて/);
    expect(本文.closest('details')).toBeNull();
  });

  it('見出しのある証言は、本文の冒頭ではなく見出しを、つまみの名前にする', () => {
    const ケース: Case = { ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 見出し付きの記述] };
    render(<TimelineView target={ケース} />);

    expect(screen.getByRole('button', { name: '「Zによる恐喝事件があった」を動かす' })).toBeInTheDocument();
  });

  it('証言が1件も無い場合は、書き始め方の案内を表示する', () => {
    render(<TimelineView target={{ ...sampleFictionalCase, claims: [], relationships: [] }} />);

    expect(screen.getByText('まだ何も書かれていません。「ボードに書き足す」から書き始めてください。')).toBeInTheDocument();
  });
});

/** ストアのケースを時系列ボードに表示します。ボードへの書き足しがストアを通じて画面に反映されることを検証するために使います。 */
function StoreBoard() {
  return <TimelineView target={useCurrentCase()} />;
}

/** 警察の捜索（8月15日）についての証言です。 */
const 捜索の記述: Claim = {
  id: 'claim-police-search',
  speaker: { kind: 'person', personIds: ['person-newspaper'] },
  viaPersonIds: [],
  content: '警察が別荘を捜索した。',
  mentionedPersonIds: [],
  when: '1998-08-15',
};

describe('TimelineView への書き足し', () => {
  beforeEach(() => {
    openTestCase({ ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 捜索の記述] });
  });

  it('項目の前に書き足すと、日時を付けずに、その位置に現れる', async () => {
    // 前提: 並びは サンプルの証言（管理人の「夜7時に見回り」が先頭）→ ユーザーの推測 → 警察の捜索
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: '「@管理人の証言は事件の20年後に初めて出…」の前に書き足す' }));
    await user.type(screen.getByLabelText('内容'), '別荘の前に見慣れない車が停まっていた。');
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    expect(openedCase().claims.at(-1)?.when).toBeUndefined();
    const 時系列 = screen.getByRole('list', { name: '時系列' });
    const 本文の並び = within(時系列)
      .getAllByText(/見回りをしたとき|見慣れない車|金銭の問題があった可能性/)
      .map((element) => element.textContent);
    expect(本文の並び).toEqual([
      expect.stringContaining('見回りをしたとき'),
      expect.stringContaining('見慣れない車'),
      expect.stringContaining('金銭の問題があった可能性'),
    ]);
  });

  it('先頭の項目の前にも書き足せる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: /^「.*見回りをしたとき.*」の前に書き足す$/ }));
    await user.type(screen.getByLabelText('内容'), '持ち主は8月の初めに別荘へ来たらしい。');
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    expect(openedCase().timelineOrder[0]).toBe(
      `claim:${openedCase().claims.at(-1)?.id}`
    );
  });

  it('「ボードに書き足す」で書いた証言は、時系列の末尾に現れる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '持ち主の交友関係を調べたい。');
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    const 時系列 = screen.getByRole('list', { name: '時系列' });
    const 最後の項目 = within(時系列).getAllByRole('listitem').at(-1)!;
    expect(最後の項目).toHaveTextContent('持ち主の交友関係を調べたい。');
  });

  it('「やめる」で、保存せずに入力欄を閉じる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);
    const 件数 = openedCase().claims.length;

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '書きかけの文章');
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(screen.queryByLabelText('内容')).not.toBeInTheDocument();
    expect(openedCase().claims).toHaveLength(件数);
  });

  it('発言者の選択肢では、人物ではない種別を名前に添えて示す', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.click(screen.getByRole('button', { name: /^発言者/ }));

    const 発言者 = within(screen.getByRole('group', { name: '発言者' }));
    expect(発言者.getByRole('checkbox', { name: '県道の防犯カメラ（記録・媒体）' })).toBeInTheDocument();
    expect(発言者.getByRole('checkbox', { name: '県警（組織）' })).toBeInTheDocument();
    // 個人（人物）は最も多い種別のため、種別を添えない
    expect(発言者.getByRole('checkbox', { name: '隣家の住人' })).toBeInTheDocument();
  });

  it('ボードに書き足すときに、誰の発言かを「発言者」で紐づけられる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '持ち主は几帳面な人だった。');
    await user.click(screen.getByRole('button', { name: /^発言者/ }));
    await user.click(within(screen.getByRole('group', { name: '発言者' })).getByRole('checkbox', { name: '隣家の住人' }));
    await user.click(within(screen.getByRole('group', { name: '経由' })).getByRole('checkbox', { name: '架空日報 朝刊（記録・媒体）' }));
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    // 検証: カードに発言者の名前と経由が現れ、本文には発言者の記法が入らない
    const 書き足した証言 = screen.getByText(/持ち主は几帳面な人だった。/).closest('li')!;
    expect(within(書き足した証言).getByText('隣家の住人')).toBeInTheDocument();
    expect(within(書き足した証言).getByText('（架空日報 朝刊 による）')).toBeInTheDocument();
    expect(openedCase().claims.at(-1)).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['person-newspaper'],
      content: '持ち主は几帳面な人だった。',
    });
  });

  it('証言のカードは詳細ページへのリンクになり、ボード上には編集・詳細のボタンを置かない', () => {
    // 前提: 証言の編集・削除・日時の入力は、詳細ページ（ClaimDetail）に一本化している
    render(<StoreBoard />);

    const 捜索 = screen.getByText(/警察が別荘を捜索した。/).closest('li')!;
    expect(within(捜索).getByRole('link', { name: '「警察が別荘を捜索した。」を開く' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-police-search'
    );
    expect(within(捜索).queryByRole('button', { name: 'この証言を編集' })).not.toBeInTheDocument();
    expect(within(捜索).queryByRole('button', { name: 'この証言の詳細' })).not.toBeInTheDocument();
  });

  it('本文のメンションは、その人物・場所の詳細ページへのリンクになる', () => {
    // 前提: メンションからたどった先でも、時系列のタブに戻れるようにする
    render(<StoreBoard />);

    const 隣家の証言 = screen.getByText(/明かりがついていて/).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: '@湖畔の別荘' })).toHaveAttribute('href', '/cases/case-lakeside/places/place-villa');
  });
});

describe('SpeakerView', () => {
  it('発言者ごとに証言をまとめ、ユーザーの推測を区別して表示する', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 管理人 = screen.getByRole('region', { name: '管理人' });
    expect(within(管理人).getByText(/見回りをしたとき/)).toBeInTheDocument();
    // 発言者名はグループの見出しと重複するため示さないが、経由は証言ごとに示す
    expect(within(管理人).getByText('（湖畔の夏 20年目の証言（架空の書籍） による）')).toBeInTheDocument();

    const 推測 = screen.getByRole('region', { name: 'ユーザーの推測' });
    expect(within(推測).getByText(/金銭の問題があった可能性/)).toBeInTheDocument();
  });

  it('証言のカードは、証言者別のタブを戻り先に引き継いだ、詳細ページへのリンクになる', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 管理人 = screen.getByRole('region', { name: '管理人' });
    expect(within(管理人).getByRole('link', { name: /を開く$/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-caretaker?tab=speaker');
  });

  it('証言が1件も無い場合は、案内を表示する', () => {
    render(<SpeakerView target={{ ...sampleFictionalCase, claims: [], relationships: [] }} />);

    expect(screen.getByText('証言がまだ登録されていません。時系列のボードから書き足してください。')).toBeInTheDocument();
  });
});

describe('PersonLaneView', () => {
  it('登場する人物を列の見出しにし、証言を時系列ボードの並び順で行に並べ、行の見出しに日時を示す', () => {
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 表 = screen.getByRole('table', { name: '人物の動き' });
    expect(within(表).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '日時',
      expect.stringContaining('別荘の持ち主'),
      expect.stringContaining('隣家の住人'),
      expect.stringContaining('管理人'),
      expect.stringContaining('県道の防犯カメラ'),
      expect.stringContaining('架空日報 朝刊'),
    ]);
    // 前提: サンプルの並びは、管理人（夜7時）→ 防犯カメラ（夜8時10分）→ 隣家の住人（夜9時）→ 架空日報 → ユーザーの推測
    expect(within(表).getAllByRole('rowheader').map((header) => header.textContent)).toEqual([
      '1998年8月12日 19:00',
      '1998年8月12日 20:10',
      '1998年8月12日 21:00',
      '日時不明',
      '日時不明',
    ]);
  });

  it('証言を、発言した人物と言及された人物の両方の列に置き、どちらなのかを示す', () => {
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 管理人の証言の行 = screen.getAllByRole('row')[1]!;
    const セル = within(管理人の証言の行).getAllByRole('cell');
    // 列の並び: 別荘の持ち主・隣家の住人・管理人・県道の防犯カメラ・架空日報 朝刊
    expect(within(セル[0]!).getByText('言及')).toBeInTheDocument();
    expect(within(セル[0]!).getByText(/見回りをしたとき/)).toBeInTheDocument();
    expect(セル[1]).toBeEmptyDOMElement();
    expect(within(セル[2]!).getByText('発言')).toBeInTheDocument();
    expect(within(セル[2]!).getByText(/見回りをしたとき/)).toBeInTheDocument();
  });

  it('列の見出しに、人物ではない種別を示す', () => {
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 見出し = within(screen.getByRole('table', { name: '人物の動き' })).getAllByRole('columnheader');
    expect(見出し.find((header) => header.textContent?.includes('県道の防犯カメラ'))).toHaveTextContent('記録・媒体');
    expect(見出し.find((header) => header.textContent?.includes('管理人'))).not.toHaveTextContent('人物');
  });

  it('人物の種別のチェックを外すと、その種別の列を表から外す', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 種別 = screen.getByRole('group', { name: '表示する人物の種別' });
    await user.click(within(種別).getByRole('checkbox', { name: '記録・媒体' }));

    const 表 = screen.getByRole('table', { name: '人物の動き' });
    expect(within(表).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '日時',
      expect.stringContaining('別荘の持ち主'),
      expect.stringContaining('隣家の住人'),
      expect.stringContaining('管理人'),
    ]);
  });

  it('すべての種別のチェックを外しても、絞り込みを戻せるようにチェックボックスを残す', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 種別 = screen.getByRole('group', { name: '表示する人物の種別' });
    for (const ラベル of ['人物', '組織', '記録・媒体', '物']) {
      await user.click(within(種別).getByRole('checkbox', { name: ラベル }));
    }

    expect(screen.queryByRole('table', { name: '人物の動き' })).not.toBeInTheDocument();
    expect(screen.getByText('表示する種別の人物が登場する証言がありません。')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '表示する人物の種別' })).getAllByRole('checkbox')).toHaveLength(4);
  });

  it('人物の動きを追えるよう、証言が述べる場所をカードの上部に示す', () => {
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 管理人の証言の行 = screen.getAllByRole('row')[1]!;
    const 管理人のセル = within(管理人の証言の行).getAllByRole('cell')[2]!;
    const カード = within(管理人のセル).getByText(/見回りをしたとき/).closest('li')!;
    const 上部 = カード.firstElementChild as HTMLElement;
    expect(within(上部).getByText('湖畔の別荘')).toBeInTheDocument();
    // 場所は上部にまとめ、下段では繰り返さない
    expect(within(カード).getAllByText('湖畔の別荘')).toHaveLength(1);
  });

  it('証言のカードは、人物の動きのタブを戻り先に引き継いだ、詳細ページへのリンクになる', () => {
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 管理人の証言の行 = screen.getAllByRole('row')[1]!;
    expect(within(管理人の証言の行).getAllByRole('link', { name: /を開く$/ })[0]).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker?tab=lanes'
    );
  });

  it('列の見出しに、列を左右へ動かすつまみを置く', () => {
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 表 = screen.getByRole('table', { name: '人物の動き' });
    const 管理人の見出し = within(表).getAllByRole('columnheader')[3]!;
    expect(within(管理人の見出し).getByRole('button', { name: '「管理人」の列を動かす' })).toBeInTheDocument();
  });

  it('人物の列の並び順を保存していれば、そのとおりに列を並べる', () => {
    render(<PersonLaneView target={{ ...sampleFictionalCase, personLaneOrder: ['person-caretaker'] }} />);

    const 表 = screen.getByRole('table', { name: '人物の動き' });
    expect(within(表).getAllByRole('columnheader')[1]).toHaveTextContent('管理人');
  });

  it('人物の登場する証言が1件も無い場合は、案内を表示する', () => {
    render(<PersonLaneView target={{ ...sampleFictionalCase, claims: [], relationships: [] }} />);

    expect(
      screen.getByText('人物が登場する証言がまだありません。証言の発言者を選ぶか、本文で人物に言及してください。')
    ).toBeInTheDocument();
  });
});

describe('PersonLaneView の時刻軸', () => {
  /** 表示を「時刻軸」に切り替え、時刻軸の領域を返します。 */
  async function 時刻軸に切り替える(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: '時刻軸' }));
    return screen.getByRole('region', { name: '人物の動きの時刻軸' });
  }

  it('「時刻軸」に切り替えると、証言の順の表の代わりに、人物ごとの列に証言の帯を描く', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);

    const 時刻軸 = await 時刻軸に切り替える(user);

    expect(screen.queryByRole('table', { name: '人物の動き' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '時刻軸' })).toHaveAttribute('aria-pressed', 'true');
    // 検証: 管理人の列に、夜7時の管理人の発言の帯があり、証言の詳細ページへのリンクになっている
    const 管理人の列 = within(時刻軸).getByRole('region', { name: '管理人' });
    expect(within(管理人の列).getByRole('link', { name: /^発言 1998年8月12日 19:00 / })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker?tab=lanes'
    );
  });

  it('日時を述べない証言は帯にせず、その件数を示す', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);

    await 時刻軸に切り替える(user);

    // 前提: サンプルでは、架空日報の記事とユーザーの推測の2件が、人物に言及しつつ日時を述べない
    expect(screen.getByText('日時を述べない証言（2件）は、時刻軸に表示しません。')).toBeInTheDocument();
  });

  it('注目する時間帯を入力すると、各人物の列の見出しに、その時間帯の証言があるか空白かを示す', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);
    const 時刻軸 = await 時刻軸に切り替える(user);

    await user.type(screen.getByLabelText('注目する時間帯'), '1998年8月12日18時30分〜19時30分');

    // 前提: 管理人（発言）と別荘の持ち主（言及）は夜7時の証言に登場し、隣家の住人は夜9時の証言にだけ登場する
    expect(within(時刻軸).getByRole('region', { name: '管理人' })).toHaveTextContent('証言あり（1件）');
    expect(within(時刻軸).getByRole('region', { name: '別荘の持ち主' })).toHaveTextContent('証言あり（1件）');
    expect(within(時刻軸).getByRole('region', { name: '隣家の住人' })).toHaveTextContent('空白');
  });

  it('日時として解釈できない注目する時間帯には、理由を示す', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);
    await 時刻軸に切り替える(user);

    await user.type(screen.getByLabelText('注目する時間帯'), '夕飯の後');

    expect(screen.getByLabelText('注目する時間帯')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/日時として解釈できません/)).toBeInTheDocument();
  });

  it('表示する範囲を入力すると、範囲の外の帯を描かない', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);
    const 時刻軸 = await 時刻軸に切り替える(user);

    await user.type(screen.getByLabelText('表示する範囲'), '1998年8月12日20時〜22時');

    // 検証: 夜7時の管理人の帯は範囲の外のため描かず、夜9時の隣家の住人の帯は描く
    expect(within(within(時刻軸).getByRole('region', { name: '管理人' })).queryByRole('link')).not.toBeInTheDocument();
    expect(within(within(時刻軸).getByRole('region', { name: '隣家の住人' })).getByRole('link')).toBeInTheDocument();
  });

  it('「証言の順」に戻すと、証言の順の表を表示する', async () => {
    const user = userEvent.setup();
    render(<PersonLaneView target={sampleFictionalCase} />);
    await 時刻軸に切り替える(user);

    await user.click(screen.getByRole('button', { name: '証言の順' }));

    expect(screen.getByRole('table', { name: '人物の動き' })).toBeInTheDocument();
  });
});

describe('証言カードの重なり順', () => {
  it('カードの中で手前に出す要素が、カードの外（上に開いた日時のピッカーなど）より手前に出ないよう、カードごとに重なり順を閉じ込める', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const 住人の証言 = screen.getByText(/明かりがついていて/).closest('li');

    // isolate（isolation: isolate）が無いと、カード内の z-10 がページ全体の重なり順に加わり、
    // 後に描画されるカードの本文が、ポップアップ（z-10）の上に重なって見えてしまう
    expect(住人の証言).toHaveClass('isolate');
  });
});

describe('エンティティの画像の表示', () => {
  const 住人の画像 = 'data:image/jpeg;base64,住人';
  const 別荘の画像 = 'data:image/jpeg;base64,別荘';
  /** 隣家の住人と湖畔の別荘に画像を登録したケースです。 */
  const 画像付きのケース: Case = {
    ...sampleFictionalCase,
    persons: sampleFictionalCase.persons.map((person) =>
      person.id === 'person-neighbor' ? { ...person, imageDataUrl: 住人の画像 } : person
    ),
    places: sampleFictionalCase.places.map((place) => ({ ...place, imageDataUrl: 別荘の画像 })),
  };

  /** 要素の中にある画像の src を、表示順に返します。名前の隣に添える画像は装飾（alt が空）のため、role では探せません。 */
  function imageSources(element: HTMLElement | null): (string | null)[] {
    return [...(element?.querySelectorAll('img') ?? [])].map((image) => image.getAttribute('src'));
  }

  it('時系列の証言カードに、発言者の画像と、本文のメンションの画像を表示する', () => {
    render(<TimelineView target={画像付きのケース} />);

    const 住人の証言 = screen.getByText(/明かりがついていて/).closest('li');

    // 発言者（隣家の住人）、本文のメンション（湖畔の別荘）の順。画像の無い別荘の持ち主には何も表示しない
    expect(imageSources(住人の証言)).toEqual([住人の画像, 別荘の画像]);
  });

  it('画像を登録していないケースでは、画像を表示しない', () => {
    const { container } = render(<TimelineView target={sampleFictionalCase} />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('証言者別ビューの見出しに、発言者の画像を表示する', () => {
    render(<SpeakerView target={画像付きのケース} />);

    const 見出し = within(screen.getByRole('region', { name: '隣家の住人' })).getByRole('heading', { name: /隣家の住人/ });

    expect(imageSources(見出し)).toEqual([住人の画像]);
  });
});

describe('人物のアイコンの表示', () => {
  /**
   * 要素の中にある文字のアイコンの文字を、表示順に返します。名前の隣に添えるアイコンは装飾のため、role では探せません。
   * 文字は CSS で描画するため、要素の中身ではなく data-icon-text 属性に入っています。
   */
  function iconTexts(element: Element | null): (string | null)[] {
    return [...(element?.querySelectorAll('[data-icon-text]') ?? [])].map((icon) => icon.getAttribute('data-icon-text'));
  }

  it('画像の無い人物は、名前の先頭の文字をアイコンにして、発言者と本文のメンションに添える（場所には添えない）', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const 住人の証言 = screen.getByText(/明かりがついていて/).closest('li');

    // 発言者（隣家の住人）、本文のメンション（別荘の持ち主）、言及の欄（別荘の持ち主）の順。湖畔の別荘（場所）には何も表示しない
    expect(iconTexts(住人の証言)).toEqual(['隣', '別', '別']);
  });

  it('アイコンの文字を指定した人物は、名前の先頭の文字ではなく、指定した文字をアイコンにする', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor' ? { ...person, iconText: '住' } : person
      ),
    };
    render(<TimelineView target={ケース} />);

    const 住人の証言 = screen.getByText(/明かりがついていて/).closest('li');

    expect(iconTexts(住人の証言)[0]).toBe('住');
  });

  it('画像を登録した人物は、文字のアイコンではなく画像を表示する', () => {
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor' ? { ...person, imageDataUrl: 'data:image/jpeg;base64,住人' } : person
      ),
    };
    render(<TimelineView target={ケース} />);

    const 住人の証言 = screen.getByText(/明かりがついていて/).closest('li');

    // 発言者（隣家の住人）は画像になるため、文字のアイコンは別荘の持ち主の2つだけが残る
    expect(iconTexts(住人の証言)).toEqual(['別', '別']);
  });

  it('証言カードの言及の欄は、言及している人物のアイコンを並べ、名前はアイコンの説明として持つ', () => {
    // 前提: ユーザーの推測は、管理人・隣家の住人・別荘の持ち主の3人に言及している
    render(<TimelineView target={sampleFictionalCase} />);

    const 推測 = screen.getByText(/金銭の問題があった可能性/).closest('li');
    if (!推測) throw new Error('ユーザーの推測のカードが見つかりません');
    // 言及のアイコンは、その人物の詳細ページへのリンクになる。名前はリンクの名前として持つ
    const 言及している人物 = within(within(推測).getByRole('list', { name: '言及している人物' })).getAllByRole('link');

    expect(言及している人物.map((icon) => icon.getAttribute('aria-label'))).toEqual(['管理人', '隣家の住人', '別荘の持ち主']);
    expect(言及している人物.flatMap((icon) => iconTexts(icon))).toEqual(['管', '隣', '別']);
  });

  it('言及の欄のアイコンは、その人物の詳細ページへのリンクになる', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const 推測 = screen.getByText(/金銭の問題があった可能性/).closest('li');
    if (!推測) throw new Error('ユーザーの推測のカードが見つかりません');
    const 言及 = within(推測).getByRole('list', { name: '言及している人物' });

    expect(within(言及).getByRole('link', { name: '隣家の住人' })).toHaveAttribute('href', '/cases/case-lakeside/persons/person-neighbor');
  });

  it('証言者別ビューの見出しに、画像の無い発言者の文字のアイコンを表示する', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 見出し = within(screen.getByRole('region', { name: '隣家の住人' })).getByRole('heading', { name: /隣家の住人/ });

    expect(iconTexts(見出し)).toEqual(['隣']);
  });
});
