/**
 * 時系列ビューと証言者別ビューの表示のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Claim } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { SpeakerView } from './SpeakerView';
import { TimelineView } from './TimelineView';

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
  it('証言を、案件の並び順のとおりに並べ、述べる日時を持つ証言にはカードの上に日時を示す', () => {
    // 前提: サンプルの並びは、管理人（夜7時）→ 防犯カメラ（夜8時10分ごろ）→ 隣家の住人（夜9時ごろ）→ 架空日報 → ユーザーの推測
    render(<TimelineView target={sampleFictionalCase} />);

    const 時系列 = screen.getByRole('list', { name: '時系列' });
    const 本文の並び = within(時系列)
      .getAllByText(/夜7時に見回り|夜8時10分ごろ、|夜9時ごろ、|連絡が取れなくなっている|金銭の問題があった可能性/)
      .map((element) => element.textContent);
    expect(本文の並び).toEqual([
      expect.stringContaining('夜7時に見回り'),
      expect.stringContaining('夜8時10分ごろ、'),
      expect.stringContaining('夜9時ごろ、'),
      expect.stringContaining('連絡が取れなくなっている'),
      expect.stringContaining('金銭の問題があった可能性'),
    ]);
    expect(within(時系列).getAllByText('1998年8月12日 19:00').length).toBeGreaterThan(0);
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

  it('見出しのある証言は、見出しを表示し、本文は折りたたんで示す', () => {
    // 前提: 長い本文に、要約としての見出しを付けている
    const 案件: Case = { ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 見出し付きの記述] };
    render(<TimelineView target={案件} />);

    const 証言 = screen.getByText('Zによる恐喝事件があった').closest('li')!;
    const 本文 = within(証言).getByText(/現金を渡すよう繰り返し迫った/);
    // 検証: 本文は「本文を表示」を開くまで閉じている
    expect(within(証言).getByText('本文を表示')).toBeInTheDocument();
    expect(本文.closest('details')).not.toHaveAttribute('open');
  });

  it('見出しの無い証言は、本文を折りたたまずに表示する', () => {
    render(<TimelineView target={sampleFictionalCase} />);

    const 本文 = screen.getByText(/夜9時ごろ、/);
    expect(本文.closest('details')).toBeNull();
  });

  it('見出しのある証言は、本文の冒頭ではなく見出しを、つまみの名前にする', () => {
    const 案件: Case = { ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 見出し付きの記述] };
    render(<TimelineView target={案件} />);

    expect(screen.getByRole('button', { name: '「Zによる恐喝事件があった」を動かす' })).toBeInTheDocument();
  });

  it('証言が1件も無い場合は、書き始め方の案内を表示する', () => {
    render(<TimelineView target={{ ...sampleFictionalCase, claims: [], relationships: [] }} />);

    expect(screen.getByText('まだ何も書かれていません。「ボードに書き足す」から書き始めてください。')).toBeInTheDocument();
  });
});

/** ストアの案件を時系列ボードに表示します。ボードへの書き足しがストアを通じて画面に反映されることを検証するために使います。 */
function StoreBoard() {
  const currentCase = useCaseStore((state) => state.currentCase);
  return <TimelineView target={currentCase} />;
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
    useCaseStore.getState().replaceCase({ ...sampleFictionalCase, claims: [...sampleFictionalCase.claims, 捜索の記述] });
  });

  it('項目の前に書き足すと、日時を付けずに、その位置に現れる', async () => {
    // 前提: 並びは サンプルの証言（管理人の「夜7時に見回り」が先頭）→ ユーザーの推測 → 警察の捜索
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: '「@管理人の証言は事件の20年後に初めて出…」の前に書き足す' }));
    await user.type(screen.getByLabelText('内容'), '別荘の前に見慣れない車が停まっていた。');
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    expect(useCaseStore.getState().currentCase.claims.at(-1)?.when).toBeUndefined();
    const 時系列 = screen.getByRole('list', { name: '時系列' });
    const 本文の並び = within(時系列)
      .getAllByText(/夜7時に見回り|見慣れない車|金銭の問題があった可能性/)
      .map((element) => element.textContent);
    expect(本文の並び).toEqual([
      expect.stringContaining('夜7時に見回り'),
      expect.stringContaining('見慣れない車'),
      expect.stringContaining('金銭の問題があった可能性'),
    ]);
  });

  it('先頭の項目の前にも書き足せる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: /^「夜7時に見回りをしたとき.*」の前に書き足す$/ }));
    await user.type(screen.getByLabelText('内容'), '持ち主は8月の初めに別荘へ来たらしい。');
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    expect(useCaseStore.getState().currentCase.timelineOrder[0]).toBe(
      `claim:${useCaseStore.getState().currentCase.claims.at(-1)?.id}`
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
    const 件数 = useCaseStore.getState().currentCase.claims.length;

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '書きかけの文章');
    await user.click(screen.getByRole('button', { name: 'やめる' }));

    expect(screen.queryByLabelText('内容')).not.toBeInTheDocument();
    expect(useCaseStore.getState().currentCase.claims).toHaveLength(件数);
  });

  it('ボードに書き足すときに、誰の発言かを「発言者」で紐づけられる', async () => {
    const user = userEvent.setup();
    render(<StoreBoard />);

    await user.click(screen.getByRole('button', { name: 'ボードに書き足す' }));
    await user.type(screen.getByLabelText('内容'), '持ち主は几帳面な人だった。');
    await user.click(screen.getByRole('button', { name: /^発言者/ }));
    await user.click(within(screen.getByRole('group', { name: '発言者' })).getByRole('checkbox', { name: '隣家の住人' }));
    await user.click(within(screen.getByRole('group', { name: '経由' })).getByRole('checkbox', { name: '架空日報 朝刊' }));
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    // 検証: カードに発言者の名前と経由が現れ、本文には発言者の記法が入らない
    const 書き足した証言 = screen.getByText(/持ち主は几帳面な人だった。/).closest('li')!;
    expect(within(書き足した証言).getByText('隣家の住人')).toBeInTheDocument();
    expect(within(書き足した証言).getByText('（架空日報 朝刊 による）')).toBeInTheDocument();
    expect(useCaseStore.getState().currentCase.claims.at(-1)).toMatchObject({
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
      '/claims/claim-police-search'
    );
    expect(within(捜索).queryByRole('button', { name: 'この証言を編集' })).not.toBeInTheDocument();
    expect(within(捜索).queryByRole('button', { name: 'この証言の詳細' })).not.toBeInTheDocument();
  });

  it('本文のメンションは、その人物・場所の詳細ページへのリンクになる', () => {
    // 前提: メンションからたどった先でも、時系列のタブに戻れるようにする
    render(<StoreBoard />);

    const 隣家の証言 = screen.getByText(/夜9時ごろ、/).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: '@湖畔の別荘' })).toHaveAttribute('href', '/places/place-villa');
  });
});

describe('SpeakerView', () => {
  it('発言者ごとに証言をまとめ、ユーザーの推測を区別して表示する', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 管理人 = screen.getByRole('region', { name: '管理人' });
    expect(within(管理人).getByText(/夜7時に見回りをしたとき/)).toBeInTheDocument();
    // 発言者名はグループの見出しと重複するため示さないが、経由は証言ごとに示す
    expect(within(管理人).getByText('（湖畔の夏 20年目の証言（架空の書籍） による）')).toBeInTheDocument();

    const 推測 = screen.getByRole('region', { name: 'ユーザーの推測' });
    expect(within(推測).getByText(/金銭の問題があった可能性/)).toBeInTheDocument();
  });

  it('証言のカードは、証言者別のタブを戻り先に引き継いだ、詳細ページへのリンクになる', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 管理人 = screen.getByRole('region', { name: '管理人' });
    expect(within(管理人).getByRole('link', { name: /を開く$/ })).toHaveAttribute('href', '/claims/claim-caretaker?tab=speaker');
  });

  it('証言が1件も無い場合は、案内を表示する', () => {
    render(<SpeakerView target={{ ...sampleFictionalCase, claims: [], relationships: [] }} />);

    expect(screen.getByText('証言がまだ登録されていません。時系列のボードから書き足してください。')).toBeInTheDocument();
  });
});

describe('エンティティの画像の表示', () => {
  const 住人の画像 = 'data:image/jpeg;base64,住人';
  const 別荘の画像 = 'data:image/jpeg;base64,別荘';
  /** 隣家の住人と湖畔の別荘に画像を登録した案件です。 */
  const 画像付きの案件: Case = {
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
    render(<TimelineView target={画像付きの案件} />);

    const 住人の証言 = screen.getByText(/夜9時ごろ、/).closest('li');

    // 発言者（隣家の住人）、本文のメンション（湖畔の別荘）の順。画像の無い別荘の持ち主には何も表示しない
    expect(imageSources(住人の証言)).toEqual([住人の画像, 別荘の画像]);
  });

  it('画像を登録していない案件では、画像を表示しない', () => {
    const { container } = render(<TimelineView target={sampleFictionalCase} />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('証言者別ビューの見出しに、発言者の画像を表示する', () => {
    render(<SpeakerView target={画像付きの案件} />);

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

    const 住人の証言 = screen.getByText(/夜9時ごろ、/).closest('li');

    // 発言者（隣家の住人）、本文のメンション（別荘の持ち主）、言及の欄（別荘の持ち主）の順。湖畔の別荘（場所）には何も表示しない
    expect(iconTexts(住人の証言)).toEqual(['隣', '別', '別']);
  });

  it('アイコンの文字を指定した人物は、名前の先頭の文字ではなく、指定した文字をアイコンにする', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor' ? { ...person, iconText: '住' } : person
      ),
    };
    render(<TimelineView target={案件} />);

    const 住人の証言 = screen.getByText(/夜9時ごろ、/).closest('li');

    expect(iconTexts(住人の証言)[0]).toBe('住');
  });

  it('画像を登録した人物は、文字のアイコンではなく画像を表示する', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor' ? { ...person, imageDataUrl: 'data:image/jpeg;base64,住人' } : person
      ),
    };
    render(<TimelineView target={案件} />);

    const 住人の証言 = screen.getByText(/夜9時ごろ、/).closest('li');

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

    expect(within(言及).getByRole('link', { name: '隣家の住人' })).toHaveAttribute('href', '/persons/person-neighbor');
  });

  it('証言者別ビューの見出しに、画像の無い発言者の文字のアイコンを表示する', () => {
    render(<SpeakerView target={sampleFictionalCase} />);

    const 見出し = within(screen.getByRole('region', { name: '隣家の住人' })).getByRole('heading', { name: /隣家の住人/ });

    expect(iconTexts(見出し)).toEqual(['隣']);
  });
});
