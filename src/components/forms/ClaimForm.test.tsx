/**
 * 主張の入力フォームのテスト
 *
 * 本文に「@」でメンションを書き、ソース・出来事・場所・言及している人物を本文から導出することと、
 * 発言者を投稿ボタンの横の「発言者」から選ぶことを検証します。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { useCaseStore } from '@/stores/useCaseStore';
import { ClaimForm } from './ClaimForm';

beforeEach(() => {
  useCaseStore.getState().replaceCase(sampleFictionalCase);
});

/** 内容欄に文字列を入力し、表示された候補から名前が一致するものを選びます。 */
async function typeAndChoose(user: UserEvent, text: string, optionName: string | RegExp) {
  await user.type(screen.getByLabelText('内容'), text);
  await user.click(screen.getByRole('option', { name: optionName }));
}

/** 「発言者」を開き、発言の種類を選びます。 */
async function chooseSpeakerKind(user: UserEvent, kindName: '人物の証言' | 'ソース自体の記述' | 'ユーザーの推測') {
  await user.click(screen.getByRole('button', { name: /^発言者/ }));
  await user.click(screen.getByRole('radio', { name: kindName }));
}

/** 「発言者」を開き、「人物の証言」として登録済みの人物を選びます。 */
async function choosePersonSpeakers(user: UserEvent, personNames: string[]) {
  await chooseSpeakerKind(user, '人物の証言');
  for (const name of personNames) await user.click(screen.getByRole('checkbox', { name }));
}

/** 最後に保存された主張を返します。 */
function lastSavedClaim() {
  return useCaseStore.getState().currentCase.claims.at(-1);
}

describe('ClaimForm', () => {
  it('登録済みの場所・人物・出来事・ソースを「@」で選び、本文から参照を導出して保存する', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    await typeAndChoose(user, '翌朝、@湖畔', '場所 湖畔の別荘');
    await typeAndChoose(user, 'の郵便受けに@持ち主', '人物 別荘の持ち主');
    await typeAndChoose(user, 'あての新聞が残っていた。@最後に', '出来事 持ち主が最後に目撃された');
    await typeAndChoose(user, ' @架空日報', 'ソース 架空日報 朝刊');
    await choosePersonSpeakers(user, ['隣家の住人']);
    await user.type(screen.getByLabelText('証言が述べる日時：最も早い時点'), '1998-08-13');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    // 検証: 発言者は本文に書かず、「発言者」で選んだ人物を保存する
    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      sourceId: 'source-newspaper',
      content:
        '翌朝、@[湖畔の別荘](place:place-villa)の郵便受けに@[別荘の持ち主](person:person-owner)あての新聞が残っていた。@[持ち主が最後に目撃された](event:event-last-seen) @[架空日報 朝刊](source:source-newspaper)',
      eventId: 'event-last-seen',
      placeId: 'place-villa',
      mentionedPersonIds: ['person-owner'],
      when: { text: '1998-08-13', earliest: '1998-08-13' },
    });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('本文の先頭に「@人物:」と書いても発言者にはならず、言及している人物として保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@隣家', '人物 隣家の住人');
    await user.type(screen.getByLabelText('内容'), ': 時刻を勘違いしているのではないか。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

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

  it('未登録の名前は、種類を選んで新規作成し、主張と同時に保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@湖畔駅', '「湖畔駅」を場所として新規作成');
    await typeAndChoose(user, 'で持ち主を見かけた。@配達員の手記', '「配達員の手記」をソースとして新規作成');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const { places, sources } = useCaseStore.getState().currentCase;
    const 湖畔駅 = places.find((place) => place.name === '湖畔駅');
    const 手記 = sources.find((source) => source.title === '配達員の手記');
    expect(手記).toMatchObject({ kind: 'other' });
    expect(lastSavedClaim()).toMatchObject({ placeId: 湖畔駅?.id, sourceId: 手記?.id });
  });

  it('新規作成した名前を本文から消した場合は、そのエンティティを保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@郵便配達員', '「郵便配達員」を人物として新規作成');
    await user.clear(screen.getByLabelText('内容'));
    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()?.content).toBe('配達の時刻を調べたい。');
    expect(useCaseStore.getState().currentCase.persons).toEqual(sampleFictionalCase.persons);
  });

  it('入力中に、本文から読み取ったソースを表示する（発言者は本文から読み取らない）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '車は無かった。@湖畔の夏', /^ソース 湖畔の夏/);

    const summary = screen.getByLabelText('本文から読み取った参照');
    expect(summary).toHaveTextContent('ソース湖畔の夏 20年目の証言（架空の書籍）');
    expect(summary).not.toHaveTextContent('発言者');
  });

  it('メンションの無い本文は、ユーザーの推測としてソースなしで保存できる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 前提: 発言者を選ばなければ「ユーザーの推測」になる
    expect(screen.getByRole('button', { name: '発言者: ユーザーの推測' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('内容'), '時刻の勘違いではないか。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()?.speaker).toEqual({ kind: 'user' });
    expect(lastSavedClaim()?.sourceId).toBeUndefined();
  });

  it('解釈できない日時を入力した場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '日時の書き方を間違えた推測。');
    await user.type(screen.getByLabelText('述べられた時点：最も早い時点'), '1998年8月');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('述べられた時点');
    expect(useCaseStore.getState().currentCase.claims).toEqual(sampleFictionalCase.claims);
  });

  it('主張に真偽の評価を付ける入力欄を持たない', () => {
    // 発表者が警察であっても内容が真実とは限らないため、主張には「信頼できる」などの評価を付けない
    render(<ClaimForm onDone={vi.fn()} />);

    expect(screen.queryByLabelText('評価')).not.toBeInTheDocument();
  });

  it('既存の主張を編集すると、同じIDのまま置き換える', async () => {
    const user = userEvent.setup();
    const 隣家の証言 = sampleFictionalCase.claims[1]!;
    render(<ClaimForm initial={隣家の証言} onDone={vi.fn()} />);

    await user.clear(screen.getByLabelText('ソース内の位置'));
    await user.type(screen.getByLabelText('ソース内の位置'), '社会面 3段目');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const { claims } = useCaseStore.getState().currentCase;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 隣家の証言.id)).toEqual({ ...隣家の証言, locator: '社会面 3段目' });
  });
});

describe('ClaimForm の発言者の選択', () => {
  it('複数の人物を選ぶと、全員を発言者として保存し、ボタンに全員の名前を示す', async () => {
    // 前提: 1つの記事が、隣家の住人と管理人の2人が同じことを述べたと伝えている
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '持ち主は几帳面な人だった。 @架空日報', 'ソース 架空日報 朝刊');
    await choosePersonSpeakers(user, ['隣家の住人', '管理人']);

    expect(screen.getByRole('button', { name: '発言者: 隣家の住人、管理人' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
      sourceId: 'source-newspaper',
      mentionedPersonIds: [],
    });
  });

  it('「ソース自体の記述」を選ぶと、人物ではなくソースを発言者として保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '捜索は13日の朝に始まった。 @架空日報', 'ソース 架空日報 朝刊');
    await chooseSpeakerKind(user, 'ソース自体の記述');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()).toMatchObject({ speaker: { kind: 'source' }, sourceId: 'source-newspaper' });
  });

  it('未登録の人物は「人物を追加」から新規作成して発言者にでき、主張と同時に保存する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '13日の朝、郵便受けは空だった。 @架空日報', 'ソース 架空日報 朝刊');
    await chooseSpeakerKind(user, '人物の証言');
    await user.type(screen.getByLabelText('人物を追加'), '郵便配達員');
    await user.click(screen.getByRole('button', { name: '追加' }));

    // 検証: 追加した人物は選択済みになり、入力欄は空に戻る
    expect(screen.getByRole('checkbox', { name: '郵便配達員' })).toBeChecked();
    expect(screen.getByLabelText('人物を追加')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const 郵便配達員 = useCaseStore.getState().currentCase.persons.find((person) => person.name === '郵便配達員');
    expect(郵便配達員).toBeDefined();
    expect(lastSavedClaim()?.speaker).toEqual({ kind: 'person', personIds: [郵便配達員?.id] });
  });

  it('「人物を追加」に登録済みの人物の名前を入力した場合は、新規作成せずにその人物を選ぶ', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await chooseSpeakerKind(user, '人物の証言');
    await user.type(screen.getByLabelText('人物を追加'), '管理人{Enter}');

    expect(screen.getByRole('checkbox', { name: '管理人' })).toBeChecked();
    expect(screen.getAllByRole('checkbox', { name: '管理人' })).toHaveLength(1);
  });

  it('「人物を追加」でのEnterキーは人物の追加だけを行い、主張を保存しない（日本語入力の変換確定では追加もしない）', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);
    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。');
    await chooseSpeakerKind(user, '人物の証言');
    await user.type(screen.getByLabelText('人物を追加'), '郵便配達員');

    fireEvent.keyDown(screen.getByLabelText('人物を追加'), { key: 'Enter', isComposing: true });
    expect(screen.queryByRole('checkbox', { name: '郵便配達員' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('checkbox', { name: '郵便配達員' })).toBeChecked();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('新規作成した人物を発言者から外した場合は、その人物を保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '配達の時刻を調べたい。');
    await chooseSpeakerKind(user, '人物の証言');
    await user.type(screen.getByLabelText('人物を追加'), '郵便配達員{Enter}');
    await user.click(screen.getByRole('radio', { name: 'ユーザーの推測' }));
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()?.speaker).toEqual({ kind: 'user' });
    expect(useCaseStore.getState().currentCase.persons).toEqual(sampleFictionalCase.persons);
  });

  it('人物の証言にソースのメンションが無い場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '出どころを示せない証言。');
    await choosePersonSpeakers(user, ['隣家の住人']);
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('人物の証言にはソースが必要です');
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('ソース自体の記述にソースのメンションが無い場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), 'どのソースの記述かを書き忘れた。');
    await chooseSpeakerKind(user, 'ソース自体の記述');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('ソース自体の記述にはソースが必要です');
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('「人物の証言」を選んで人物を1人も選ばなかった場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '誰の証言かを選び忘れた。 @架空日報', 'ソース 架空日報 朝刊');
    await chooseSpeakerKind(user, '人物の証言');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('発言者の人物を選んでください');
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('既存の主張を編集するときは、保存済みの発言者を示し、あとから発言者を変えられる', async () => {
    // 前提: 隣家の証言の発言者は「隣家の住人」の1人
    const user = userEvent.setup();
    const 隣家の証言 = sampleFictionalCase.claims.find((claim) => claim.id === 'claim-neighbor')!;
    render(<ClaimForm initial={隣家の証言} onDone={vi.fn()} />);

    expect(screen.getByRole('button', { name: '発言者: 隣家の住人' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^発言者/ }));
    await user.click(screen.getByRole('checkbox', { name: '管理人' }));
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const 保存後 = useCaseStore.getState().currentCase.claims.find((claim) => claim.id === 'claim-neighbor');
    expect(保存後).toEqual({ ...隣家の証言, speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] } });
  });

  it('Escapeキーで「発言者を選ぶ」を閉じる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /^発言者/ }));
    expect(screen.getByRole('group', { name: '発言者を選ぶ' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: '発言者を選ぶ' })).not.toBeInTheDocument();
  });

  it('ボード上の簡易表示（compact）でも発言者を選べる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm compact onDone={vi.fn()} />);

    await typeAndChoose(user, '夜7時には真っ暗だった。 @湖畔の夏', /^ソース 湖畔の夏/);
    await choosePersonSpeakers(user, ['管理人']);
    await user.click(screen.getByRole('button', { name: '書き足す' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      sourceId: 'source-book',
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
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

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
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()?.content).toBe('連絡先は info@example.co.jp\nと書かれていた。');
    expect(useCaseStore.getState().currentCase.persons).toEqual(sampleFictionalCase.persons);
  });

  it('新規作成の選択肢は、下矢印キーで選んでからEnterキーで確定する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 「郵便配達員」に一致する登録済みのエンティティは無く、下矢印キーで先頭の「人物として新規作成」を選ぶ
    await user.type(screen.getByLabelText('内容'), '@郵便配達員{ArrowDown}{Enter}が何かを見たのではないか。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const 郵便配達員 = useCaseStore.getState().currentCase.persons.find((person) => person.name === '郵便配達員');
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
    it('出来事の束の中で書いた主張は、本文に「@出来事」を書かなくても、その出来事に束ねて保存する', async () => {
      const user = userEvent.setup();
      render(<ClaimForm defaults={{ eventId: 'event-last-seen' }} onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '別荘の電話は12日の夜から不通だった。');
      await user.click(screen.getByRole('button', { name: '主張を保存' }));

      // 参照は本文から導出する規則を保つため、出来事のメンションを本文の末尾に補う
      expect(lastSavedClaim()).toMatchObject({
        speaker: { kind: 'user' },
        content: '別荘の電話は12日の夜から不通だった。 @[持ち主が最後に目撃された](event:event-last-seen)',
        eventId: 'event-last-seen',
      });
    });

    it('本文に別の出来事を「@」で書いた場合は、本文の出来事を優先する', async () => {
      const user = userEvent.setup();
      useCaseStore.getState().upsert('events', { id: 'event-search', title: '警察が別荘を捜索した' });
      render(<ClaimForm defaults={{ eventId: 'event-last-seen' }} onDone={vi.fn()} />);

      await typeAndChoose(user, '捜索は半日で終わった。@警察が', '出来事 警察が別荘を捜索した');
      await user.click(screen.getByRole('button', { name: '主張を保存' }));

      expect(lastSavedClaim()).toMatchObject({ eventId: 'event-search' });
    });

    it('ボードの項目と項目の間で書いた場合は、書いた位置に主張を並べる', async () => {
      // 前提: サンプルの並びは 出来事「持ち主が最後に目撃された」→ ユーザーの推測。その間（1番目）で書く
      const user = userEvent.setup();
      render(<ClaimForm defaults={{ insertIndex: 1 }} onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), '別荘の前に見慣れない車が停まっていた。');
      await user.click(screen.getByRole('button', { name: '主張を保存' }));

      // 日時は付けず、並び順だけで位置を表す
      expect(lastSavedClaim()?.when).toBeUndefined();
      expect(useCaseStore.getState().currentCase.timelineOrder).toEqual([
        'event:event-last-seen',
        `claim:${lastSavedClaim()?.id}`,
        'claim:claim-user-guess',
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
      expect(screen.queryByLabelText('証言が述べる日時：表記')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('ソース内の位置')).not.toBeInTheDocument();
    });

    it('本文だけを編集しても、入力済みの日時・ソース内の位置を保持する', async () => {
      // 前提: 管理人の証言は、日時「8月12日 夜7時」、位置「第3章 112ページ」を持つ
      const user = userEvent.setup();
      const 管理人の証言 = sampleFictionalCase.claims.find((claim) => claim.id === 'claim-caretaker')!;
      render(<ClaimForm compact initial={管理人の証言} onDone={vi.fn()} />);

      await user.type(screen.getByLabelText('内容'), ' 玄関は施錠されていた。');
      await user.click(screen.getByRole('button', { name: '主張を保存' }));

      const 保存後 = useCaseStore.getState().currentCase.claims.find((claim) => claim.id === 'claim-caretaker');
      expect(保存後?.content).toContain('玄関は施錠されていた。');
      expect(保存後).toMatchObject({
        when: 管理人の証言.when,
        statedAt: 管理人の証言.statedAt,
        locator: '第3章 112ページ',
      });
    });
  });

  it('メンションの候補が開いているときのCtrl+Enterは、候補の確定だけを行い、保存しない', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    // 前提: 「@湖畔」で登録済みの場所「湖畔の別荘」が候補の先頭に出ている
    await user.type(screen.getByLabelText('内容'), '@湖畔{Control>}{Enter}{/Control}');

    expect(screen.getByLabelText('内容')).toHaveValue('@湖畔の別荘');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('確定したメンションは、入力欄の中で種類ごとの背景色をつけて示す（未確定の「@」にはつけない）', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@隣家', '人物 隣家の住人');
    await typeAndChoose(user, 'が@湖畔', '場所 湖畔の別荘');
    await user.type(screen.getByLabelText('内容'), 'にいた。@未登録の名前');

    expect(screen.getByText('@隣家の住人')).toHaveClass('bg-sky-100');
    expect(screen.getByText('@湖畔の別荘')).toHaveClass('bg-emerald-100');
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
