/**
 * 証言の入力フォームのテスト
 *
 * 本文に「@」でメンションを書き、場所・言及している人物を本文から導出することと、
 * 発言者と経由（発言者の話を伝えた人物や媒体）を、投稿ボタンの横の「発言者」から選ぶことを検証します。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openedCase, openTestCase } from '@/test/open-case';
import { ClaimForm } from './ClaimForm';

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
});

/** 内容欄に文字列を入力し、表示された候補から名前が一致するものを選びます。 */
async function typeAndChoose(user: UserEvent, text: string, optionName: string | RegExp) {
  await user.type(screen.getByLabelText('内容'), text);
  await user.click(screen.getByRole('option', { name: optionName }));
}

/** 「発言者」のパネルを開きます。すでに開いている場合は何もしません。 */
async function openSpeakerPanel(user: UserEvent) {
  if (screen.queryByRole('group', { name: '発言者を選ぶ' })) return;
  await user.click(screen.getByRole('button', { name: /^発言者/ }));
}

/** 「発言者」のパネルの「発言者」欄で、登録済みの人物を選びます。 */
async function chooseSpeakers(user: UserEvent, personNames: string[]) {
  await openSpeakerPanel(user);
  const 発言者欄 = screen.getByRole('group', { name: '発言者' });
  for (const name of personNames) await user.click(within(発言者欄).getByRole('checkbox', { name }));
}

/** 「発言者」のパネルの「経由」欄で、登録済みの人物を、伝えた順に選びます。 */
async function chooseVia(user: UserEvent, personNames: string[]) {
  await openSpeakerPanel(user);
  const 経由欄 = screen.getByRole('group', { name: '経由' });
  for (const name of personNames) await user.click(within(経由欄).getByRole('checkbox', { name }));
}

/** 最後に保存された証言を返します。 */
function lastSavedClaim() {
  return openedCase().claims.at(-1);
}

describe('ClaimForm', () => {
  it('登録済みの場所・人物を「@」で選び、本文から参照を導出して保存する', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    await typeAndChoose(user, '翌朝、@湖畔', '場所 湖畔の別荘');
    await typeAndChoose(user, 'の郵便受けに@持ち主', '人物 別荘の持ち主');
    await user.type(screen.getByLabelText('内容'), 'あての新聞が残っていた。');
    await chooseSpeakers(user, ['隣家の住人']);
    await chooseVia(user, ['架空日報 朝刊']);
    await typeAndChoose(user, ' @1998-08-13', '日時 1998年8月13日');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    // 検証: 発言者と経由は本文に書かず、「発言者」で選んだ人物を保存する
    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['person-newspaper'],
      content:
        '翌朝、@[湖畔の別荘](place:place-villa)の郵便受けに@[別荘の持ち主](person:person-owner)あての新聞が残っていた。 @[1998年8月13日](date:1998-08-13)',
      placeId: 'place-villa',
      mentionedPersonIds: ['person-owner'],
      when: '1998-08-13',
    });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('書き終えた文章の途中に「@」を差し込むと、後ろに続く登録済みの名前で候補を絞り、名前を重複させずに確定する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);
    const 内容欄 = screen.getByLabelText('内容');

    await user.type(内容欄, '別荘の持ち主が郵便受けを見ていた。');
    // 先頭にカーソルを移して「@」だけを打つ（名前は打ち直さない）
    await user.type(内容欄, '@', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    await user.click(screen.getByRole('option', { name: '人物 別荘の持ち主' }));

    expect(内容欄).toHaveValue('@別荘の持ち主が郵便受けを見ていた。');

    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      content: '@[別荘の持ち主](person:person-owner)が郵便受けを見ていた。',
      mentionedPersonIds: ['person-owner'],
    });
  });

  it('文章の途中に「@」を差し込むと、後ろに続く語に一致する候補だけに絞り込む', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);
    const 内容欄 = screen.getByLabelText('内容');

    await user.type(内容欄, '別荘に明かりがついていた。');
    await user.type(内容欄, '@', { initialSelectionStart: 0, initialSelectionEnd: 0 });

    // 検証: 「別荘」を含む候補だけを示し、含まない人物は示さない
    expect(screen.getByRole('option', { name: '人物 別荘の持ち主' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '場所 湖畔の別荘' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '人物 隣家の住人' })).not.toBeInTheDocument();
  });

  it('本文の先頭に「@人物:」と書いても発言者にはならず、言及している人物として保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@隣家', '人物 隣家の住人');
    await user.type(screen.getByLabelText('内容'), ': 時刻を勘違いしているのではないか。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'user' },
      mentionedPersonIds: ['person-neighbor'],
    });
  });

  it('別名でも候補を絞り込める', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 「元管理人」は人物「管理人」の別名
    await user.type(screen.getByLabelText('内容'), '@元管');

    expect(screen.getByRole('option', { name: '人物 管理人' })).toBeInTheDocument();
  });

  it('未登録の名前は、種類を選んで新規作成し、証言と同時に保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@湖畔駅', '「湖畔駅」を場所として新規作成');
    await typeAndChoose(user, 'で@郵便配達員', '「郵便配達員」を人物として新規作成');
    await user.type(screen.getByLabelText('内容'), 'が持ち主を見かけたらしい。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const { places, persons } = openedCase();
    const 湖畔駅 = places.find((place) => place.name === '湖畔駅');
    const 郵便配達員 = persons.find((person) => person.name === '郵便配達員');
    expect(湖畔駅).toBeDefined();
    expect(lastSavedClaim()).toMatchObject({ placeId: 湖畔駅?.id, mentionedPersonIds: [郵便配達員?.id] });
  });

  it('メンションの種類に「ソース」は無い（新聞や書籍も人物として登録する）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '@配達員の手記');

    expect(screen.getByRole('option', { name: '「配達員の手記」を人物として新規作成' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /ソース/ })).not.toBeInTheDocument();
  });

  it('メンションの種類に「出来事」は無い（語られる出来事は、すべて誰かの証言として書く）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '@最後の目撃');

    expect(screen.getByRole('option', { name: '「最後の目撃」を人物として新規作成' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /出来事/ })).not.toBeInTheDocument();
  });

  it('新規作成した名前を本文から消した場合は、そのエンティティを保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@郵便配達員', '「郵便配達員」を人物として新規作成');
    await user.clear(screen.getByLabelText('内容'));
    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()?.content).toBe('配達の時刻を調べたい。');
    expect(openedCase().persons).toEqual(sampleFictionalCase.persons);
  });

  it('入力中に、本文から読み取った場所を表示する（発言者は本文から読み取らない）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '車は無かった。@湖畔', '場所 湖畔の別荘');

    const summary = screen.getByLabelText('本文から読み取った参照');
    expect(summary).toHaveTextContent('場所湖畔の別荘');
    expect(summary).not.toHaveTextContent('発言者');
  });

  it('本文から読み取った参照が1つも無い間は、参照の枠を表示しない', () => {
    render(<ClaimForm onDone={vi.fn()} />);

    expect(screen.queryByLabelText('本文から読み取った参照')).not.toBeInTheDocument();
  });

  it('発言者を選ばない証言は、ユーザーの推測として保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 前提: 発言者を選ばなければ「ユーザーの推測」になる
    expect(screen.getByRole('button', { name: '発言者: なし（ユーザーの推測）' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('内容'), '時刻の勘違いではないか。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()).toMatchObject({ speaker: { kind: 'user' }, viaPersonIds: [] });
  });

  describe('日時の「@」での入力', () => {
    it('「@」に続けて日時を書くと候補に示し、選ぶと本文のメンションとして日時を保存する', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await typeAndChoose(user, '@1998/8/12T19:00', '日時 1998年8月12日 19:00');
      await user.type(screen.getByLabelText('内容'), 'に見回りをした。');
      await user.click(screen.getByRole('button', { name: '証言を保存' }));

      expect(lastSavedClaim()).toMatchObject({
        content: '@[1998年8月12日 19:00](date:1998-08-12T19:00)に見回りをした。',
        when: '1998-08-12T19:00',
      });
    });

    it('「@date」で日付のピッカーを開き、選んだ日付を本文のメンションにする', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await typeAndChoose(user, '@date', '日付を選ぶ');
      fireEvent.change(screen.getByLabelText('日付を選ぶ'), { target: { value: '1998-08-12' } });
      await user.click(screen.getByRole('button', { name: '証言を保存' }));

      expect(lastSavedClaim()).toMatchObject({
        content: '@[1998年8月12日](date:1998-08-12)',
        when: '1998-08-12',
      });
    });

    it('「@datetime」で日時のピッカーを開き、選んだ日時を本文のメンションにする', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await typeAndChoose(user, '@datetime', '日時を選ぶ');
      fireEvent.change(screen.getByLabelText('日時を選ぶ'), { target: { value: '1998-08-12T19:00' } });
      await user.click(screen.getByRole('button', { name: '証言を保存' }));

      expect(lastSavedClaim()).toMatchObject({
        content: '@[1998年8月12日 19:00](date:1998-08-12T19:00)',
        when: '1998-08-12T19:00',
      });
    });

    it('「@date」に続けてEnterキーを押すだけで、日付のピッカーを開ける', async () => {
      // 前提: ピッカーは「@date」と明示的に書いた結果の候補のため、矢印キーで選ばなくても先頭が選択済みになる
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '@date{Enter}');

      expect(screen.getByLabelText('日付を選ぶ')).toBeInTheDocument();
      expect(screen.getByLabelText('内容')).toHaveValue('@date');
    });

    it('日本語の「@日付」でもピッカーを開ける（日本語入力のまま書けるようにするため）', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '@日付');

      expect(screen.getByRole('option', { name: '日付を選ぶ' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: '日時を選ぶ' })).not.toBeInTheDocument();
    });

    it('入力の途中の「@dat」では、日付と日時の両方のピッカーを候補に示す', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '@dat');

      expect(screen.getByRole('option', { name: '日付を選ぶ' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '日時を選ぶ' })).toBeInTheDocument();
    });

    it('ピッカーを開いたまま日付を選ばずにEscapeキーを押すと、ピッカーを閉じて本文を変えない', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await typeAndChoose(user, '@date', '日付を選ぶ');
      await user.keyboard('{Escape}');

      expect(screen.queryByLabelText('日付を選ぶ')).not.toBeInTheDocument();
      expect(screen.getByLabelText('内容')).toHaveValue('@date');
    });

    it('日時として解釈できない語では、日時の候補を示さない', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '@8月12日');

      expect(screen.queryByRole('option', { name: /^日時/ })).not.toBeInTheDocument();
    });

    it('日時を入力する専用の欄を持たない（日時は本文に書く）', () => {
      render(<ClaimForm onDone={vi.fn()} />);

      expect(screen.queryByLabelText('日時（任意）')).not.toBeInTheDocument();
      expect(screen.queryByText(/詳細/)).not.toBeInTheDocument();
    });

    it('本文から読み取った日時を、参照の一覧に示す', async () => {
      const user = userEvent.setup();
      render(<ClaimForm onDone={vi.fn()} />);

      await typeAndChoose(user, '@1998-08-12', '日時 1998年8月12日');

      expect(screen.getByLabelText('本文から読み取った参照')).toHaveTextContent('日時1998年8月12日');
    });
  });

  it('証言に真偽の評価を付ける入力欄を持たない', () => {
    // 発表者が警察であっても内容が真実とは限らないため、証言には「信頼できる」などの評価を付けない
    render(<ClaimForm onDone={vi.fn()} />);

    expect(screen.queryByLabelText('評価')).not.toBeInTheDocument();
  });

  it('既存の証言を編集すると、同じIDのまま置き換える', async () => {
    const user = userEvent.setup();
    const 隣家の証言 = sampleFictionalCase.claims[1]!;
    render(<ClaimForm initial={隣家の証言} onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), ' 門は開いていた。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    // 検証: 入力欄を廃止した「資料内の位置」（locator）を含め、触れていない項目は変わらない
    const { claims } = openedCase();
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 隣家の証言.id)).toEqual({
      ...隣家の証言,
      content: `${隣家の証言.content} 門は開いていた。`,
    });
  });

  it('見出しを入力すると、本文とは別の項目として保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('見出し（任意）'), '  Zによる恐喝事件があった  ');
    await user.type(screen.getByLabelText('内容'), 'Zは被害者の自宅を訪れ、現金を渡すよう繰り返し迫った。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    // 検証: 見出しは前後の空白を取り除いて保存し、本文には混ぜない
    expect(lastSavedClaim()).toMatchObject({
      title: 'Zによる恐喝事件があった',
      content: 'Zは被害者の自宅を訪れ、現金を渡すよう繰り返し迫った。',
    });
  });

  it('見出しを入力しない証言は、見出しの項目を持たない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '門は開いていた。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    // 検証: JSONの書き出しと読み込みで形が変わらないよう、空の見出しはキーごと持たせない
    expect(lastSavedClaim()).not.toHaveProperty('title');
  });

  it('既存の証言を編集するときは、保存済みの見出しを示し、消すと見出しの項目を取り除く', async () => {
    // 前提: 隣家の住人の証言に見出しが付いている
    const user = userEvent.setup();
    const 見出し付きの証言 = { ...sampleFictionalCase.claims[1]!, title: '夜9時に持ち主を庭で見た' };
    render(<ClaimForm initial={見出し付きの証言} onDone={vi.fn()} />);

    expect(screen.getByLabelText('見出し（任意）')).toHaveValue('夜9時に持ち主を庭で見た');
    await user.clear(screen.getByLabelText('見出し（任意）'));
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const 保存後 = openedCase().claims.find((claim) => claim.id === 見出し付きの証言.id);
    expect(保存後).not.toHaveProperty('title');
  });

  it('資料内の位置（ページなど）の入力欄を持たない', () => {
    // 書誌情報は詳しすぎるため入力させない。URLなどは人物（媒体）のメモ欄に書く
    render(<ClaimForm onDone={vi.fn()} />);

    expect(screen.queryByLabelText('ソース内の位置')).not.toBeInTheDocument();
  });
});

describe('ClaimForm の発言者と経由の選択', () => {
  it('複数の人物を選ぶと、全員を発言者として保存し、ボタンに発言者と経由を示す', async () => {
    // 前提: 1つの記事が、隣家の住人と管理人の2人が同じことを述べたと伝えている
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '持ち主は几帳面な人だった。');
    await chooseSpeakers(user, ['隣家の住人', '管理人']);
    await chooseVia(user, ['架空日報 朝刊']);

    expect(screen.getByRole('button', { name: '発言者: 隣家の住人、管理人（架空日報 朝刊 による）' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
      viaPersonIds: ['person-newspaper'],
      mentionedPersonIds: [],
    });
  });

  it('経由は、選んだ順（伝えた順）に保存する', async () => {
    // 前提: 防犯カメラの記録を、県警が発表し、架空日報が報じた。登録順は 県警 → 架空日報 だが、逆の順に選んでみる
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '夜8時10分ごろ、車が別荘の方向へ走っていた。');
    await chooseSpeakers(user, ['県道の防犯カメラ']);
    await chooseVia(user, ['架空日報 朝刊', '県警']);

    expect(screen.getByRole('button', { name: '発言者: 県道の防犯カメラ（架空日報 朝刊 → 県警 による）' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()?.viaPersonIds).toEqual(['person-newspaper', 'person-police']);
  });

  it('新聞の地の文は、新聞を発言者に選んで保存する（経由は無し）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '捜索は13日の朝に始まった。');
    await chooseSpeakers(user, ['架空日報 朝刊']);
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-newspaper'] },
      viaPersonIds: [],
    });
  });

  it('未登録の人物は「人物を追加」から新規作成して発言者にでき、証言と同時に保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '13日の朝、郵便受けは空だった。');
    await openSpeakerPanel(user);
    await user.type(screen.getByLabelText('発言者に人物を追加'), '郵便配達員');
    await user.click(within(screen.getByRole('group', { name: '発言者' })).getByRole('button', { name: '追加' }));

    // 検証: 追加した人物は選択済みになり、入力欄は空に戻る
    expect(within(screen.getByRole('group', { name: '発言者' })).getByRole('checkbox', { name: '郵便配達員' })).toBeChecked();
    expect(screen.getByLabelText('発言者に人物を追加')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const 郵便配達員 = openedCase().persons.find((person) => person.name === '郵便配達員');
    expect(郵便配達員).toBeDefined();
    expect(lastSavedClaim()?.speaker).toEqual({ kind: 'person', personIds: [郵便配達員?.id] });
  });

  it('未登録の媒体は「経由」の「人物を追加」から新規作成できる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '持ち主とは挨拶をする程度の付き合いだった。');
    await chooseSpeakers(user, ['管理人']);
    await user.type(screen.getByLabelText('経由に人物を追加'), '週刊架空{Enter}');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const 週刊架空 = openedCase().persons.find((person) => person.name === '週刊架空');
    expect(週刊架空).toBeDefined();
    expect(lastSavedClaim()?.viaPersonIds).toEqual([週刊架空?.id]);
  });

  it('「人物を追加」に登録済みの人物の名前を入力した場合は、新規作成せずにその人物を選ぶ', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await openSpeakerPanel(user);
    await user.type(screen.getByLabelText('発言者に人物を追加'), '管理人{Enter}');

    const 発言者欄 = screen.getByRole('group', { name: '発言者' });
    expect(within(発言者欄).getByRole('checkbox', { name: '管理人' })).toBeChecked();
    expect(within(発言者欄).getAllByRole('checkbox', { name: '管理人' })).toHaveLength(1);
  });

  it('「人物を追加」でのEnterキーは人物の追加だけを行い、証言を保存しない（日本語入力の変換確定では追加もしない）', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);
    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。');
    await openSpeakerPanel(user);
    await user.type(screen.getByLabelText('発言者に人物を追加'), '郵便配達員');
    const 発言者欄 = screen.getByRole('group', { name: '発言者' });

    fireEvent.keyDown(screen.getByLabelText('発言者に人物を追加'), { key: 'Enter', isComposing: true });
    expect(within(発言者欄).queryByRole('checkbox', { name: '郵便配達員' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(within(発言者欄).getByRole('checkbox', { name: '郵便配達員' })).toBeChecked();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('新規作成した人物を発言者から外した場合は、その人物を保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。');
    await openSpeakerPanel(user);
    await user.type(screen.getByLabelText('発言者に人物を追加'), '郵便配達員{Enter}');
    await chooseSpeakers(user, ['郵便配達員']);
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()?.speaker).toEqual({ kind: 'user' });
    expect(openedCase().persons).toEqual(sampleFictionalCase.persons);
  });

  it('発言者を選ばずに経由だけを選んだ場合は、エラーを示して保存しない', async () => {
    // 経由は「誰かの発言を誰が伝えたか」を表すため、発言者がいなければ意味を持たない
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '誰の話かを選び忘れた。');
    await chooseVia(user, ['架空日報 朝刊']);
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('発言者を選んでください');
    expect(openedCase()).toEqual(sampleFictionalCase);
  });

  it('既存の証言を編集するときは、保存済みの発言者と経由を示し、あとから変えられる', async () => {
    // 前提: 隣家の証言は、発言者が「隣家の住人」、経由が「架空日報 朝刊」
    const user = userEvent.setup();
    const 隣家の証言 = sampleFictionalCase.claims.find((claim) => claim.id === 'claim-neighbor')!;
    render(<ClaimForm initial={隣家の証言} onDone={vi.fn()} />);

    expect(screen.getByRole('button', { name: '発言者: 隣家の住人（架空日報 朝刊 による）' })).toBeInTheDocument();

    await chooseSpeakers(user, ['管理人']);
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const 保存後 = openedCase().claims.find((claim) => claim.id === 'claim-neighbor');
    expect(保存後).toEqual({ ...隣家の証言, speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] } });
  });

  it('Escapeキーで「発言者を選ぶ」を閉じる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await openSpeakerPanel(user);
    expect(screen.getByRole('group', { name: '発言者を選ぶ' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: '発言者を選ぶ' })).not.toBeInTheDocument();
  });

  it('ボード上の簡易表示（compact）でも発言者と経由を選べる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm compact onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '夜7時には真っ暗だった。');
    await chooseSpeakers(user, ['管理人']);
    await chooseVia(user, ['湖畔の夏 20年目の証言（架空の書籍）']);
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      viaPersonIds: ['person-book'],
    });
  });
});

describe('ClaimForm のキーボード操作', () => {
  it('下矢印キーで候補を移動し、Enterキーで選択する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 「の」で絞り込むと、人物「別荘の持ち主」「隣家の住人」の順に並ぶ
    await user.type(screen.getByLabelText('内容'), '@の{ArrowDown}{Enter}');

    expect(screen.getByLabelText('内容')).toHaveValue('@隣家の住人');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('日本語入力の変換を確定するEnterキーでは、候補を選択しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);
    await user.type(screen.getByLabelText('内容'), '@管理');

    fireEvent.keyDown(screen.getByLabelText('内容'), { key: 'Enter', isComposing: true });

    expect(screen.getByLabelText('内容')).toHaveValue('@管理');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('登録済みの名前を正確に入力して空白で区切った場合は、候補を選ばなくてもメンションとして扱う', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '@管理人 は何かを隠しているのではないか。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      content: '@[管理人](person:person-caretaker) は何かを隠しているのではないか。',
      mentionedPersonIds: ['person-caretaker'],
    });
  });

  it('新規作成の選択肢しか無いときのEnterキーは改行として扱い、意図しないエンティティを作らない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // メールアドレスの「@」でも候補は開くが、矢印キーで選んでいないためEnterキーでは確定しない
    await user.type(screen.getByLabelText('内容'), '連絡先は info@example.co.jp{Enter}と書かれていた。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    expect(lastSavedClaim()?.content).toBe('連絡先は info@example.co.jp\nと書かれていた。');
    expect(openedCase().persons).toEqual(sampleFictionalCase.persons);
  });

  it('新規作成の選択肢は、下矢印キーで選んでからEnterキーで確定する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 「郵便配達員」に一致する登録済みのエンティティは無く、下矢印キーで先頭の「人物として新規作成」を選ぶ
    await user.type(screen.getByLabelText('内容'), '@郵便配達員{ArrowDown}{Enter}が何かを見たのではないか。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const 郵便配達員 = openedCase().persons.find((person) => person.name === '郵便配達員');
    expect(lastSavedClaim()?.mentionedPersonIds).toEqual([郵便配達員?.id]);
  });

  it('Escapeキーで候補を閉じ、入力した文字は残す', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '@管理{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('内容')).toHaveValue('@管理');
  });

  describe('ボード上の位置から決まる初期値（defaults）', () => {
    it('ボードの項目と項目の間で書いた場合は、書いた位置に証言を並べる', async () => {
      // 前提: サンプルの並びの先頭は、管理人の証言 → 防犯カメラの記録。その間（1番目）で書く
      const user = userEvent.setup();
      render(<ClaimForm defaults={{ insertIndex: 1 }} onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '別荘の前に見慣れない車が停まっていた。');
      await user.click(screen.getByRole('button', { name: '証言を保存' }));

      // 日時は付けず、並び順だけで位置を表す
      expect(lastSavedClaim()?.when).toBeUndefined();
      expect(openedCase().timelineOrder.slice(0, 3)).toEqual([
        'claim:claim-caretaker',
        `claim:${lastSavedClaim()?.id}`,
        'claim:claim-police-camera',
      ]);
    });
  });

  it('Ctrl+Enter（macOSではCommand+Enter）で保存する', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。{Control>}{Enter}{/Control}');

    expect(lastSavedClaim()).toMatchObject({ content: '配達の時刻を調べたい。' });
    expect(onDone).toHaveBeenCalledOnce();
  });

  describe('ボード上の簡易表示（compact）', () => {
    it('本文の1欄と投稿ボタンだけを表示し、日時・ソース内の位置の入力欄を表示しない', () => {
      render(<ClaimForm compact onDone={vi.fn()} />);

      expect(screen.getByLabelText('内容')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '書き足す' })).toBeInTheDocument();
      expect(screen.queryByText(/詳細/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText('ソース内の位置')).not.toBeInTheDocument();
    });

    it('見出しの入力欄も表示する', () => {
      render(<ClaimForm compact onDone={vi.fn()} />);

      expect(screen.getByLabelText('見出し（任意）')).toBeInTheDocument();
    });

    it('本文だけを編集しても、入力済みの日時・ソース内の位置を保持する', async () => {
      // 前提: 管理人の証言は、本文に日時のメンション（1998-08-12T19:00）と、位置「第3章 112ページ」を持つ
      const user = userEvent.setup();
      const 管理人の証言 = sampleFictionalCase.claims.find((claim) => claim.id === 'claim-caretaker')!;
      render(<ClaimForm compact initial={管理人の証言} onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), ' 玄関は施錠されていた。');
      await user.click(screen.getByRole('button', { name: '証言を保存' }));

      const 保存後 = openedCase().claims.find((claim) => claim.id === 'claim-caretaker');
      expect(保存後?.content).toContain('玄関は施錠されていた。');
      expect(保存後).toMatchObject({
        when: 管理人の証言.when,
        locator: '第3章 112ページ',
      });
    });
  });

  it('メンションの候補が開いているときのCtrl+Enterは、候補の確定だけを行い、保存しない', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    // 前提: 「@湖畔の別」で登録済みの場所「湖畔の別荘」が候補の先頭に出ている
    await user.type(screen.getByLabelText('内容'), '@湖畔の別{Control>}{Enter}{/Control}');

    expect(screen.getByLabelText('内容')).toHaveValue('@湖畔の別荘');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('確定したメンションは、入力欄の中で種類ごとの背景色をつけて示す（未確定の「@」にはつけない）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@隣家', '人物 隣家の住人');
    await typeAndChoose(user, 'が@湖畔', '場所 湖畔の別荘');
    await user.type(screen.getByLabelText('内容'), 'にいた。@未登録の名前');

    // 前提: 種類ごとの色は globals.css のトークン（--mention-*）に集約している
    expect(screen.getByText('@隣家の住人')).toHaveClass('bg-mention-person');
    expect(screen.getByText('@湖畔の別荘')).toHaveClass('bg-mention-place');
    expect(screen.queryByText('@未登録の名前')).not.toBeInTheDocument();
  });

  it('メンションの直後でBackspaceキーを押すと、メンションを1文字ずつではなくまとめて削除する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);
    await typeAndChoose(user, '庭に@隣家', '人物 隣家の住人');

    await user.keyboard('{Backspace}');

    expect(screen.getByLabelText('内容')).toHaveValue('庭に');
    expect(screen.queryByText('@隣家の住人')).not.toBeInTheDocument();
  });

  it('メンションではない文字は、Backspaceキーで1文字ずつ削除する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);
    await typeAndChoose(user, '@隣家', '人物 隣家の住人');
    await user.type(screen.getByLabelText('内容'), 'が来た');

    await user.keyboard('{Backspace}');

    expect(screen.getByLabelText('内容')).toHaveValue('@隣家の住人が来');
  });

  it('日本語入力の変換中のBackspaceキーでは、メンションを削除しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);
    await typeAndChoose(user, '@隣家', '人物 隣家の住人');

    fireEvent.keyDown(screen.getByLabelText('内容'), { key: 'Backspace', isComposing: true });

    expect(screen.getByLabelText('内容')).toHaveValue('@隣家の住人');
  });
});
