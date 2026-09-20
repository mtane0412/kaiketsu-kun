/**
 * 主張の入力フォームのテスト
 *
 * 本文に「@」でメンションを書き、発言者・ソース・出来事・場所・言及している人物を本文から導出することを検証します。
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

/** 最後に保存された主張を返します。 */
function lastSavedClaim() {
  return useCaseStore.getState().currentCase.claims.at(-1);
}

describe('ClaimForm', () => {
  it('登録済みの人物・場所・出来事・ソースを「@」で選び、本文から参照を導出して保存する', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    await typeAndChoose(user, '@隣家', '人物 隣家の住人');
    await typeAndChoose(user, ': 翌朝、@湖畔', '場所 湖畔の別荘');
    await typeAndChoose(user, 'の郵便受けに@持ち主', '人物 別荘の持ち主');
    await typeAndChoose(user, 'あての新聞が残っていた。@最後に', '出来事 持ち主が最後に目撃された');
    await typeAndChoose(user, ' @架空日報', 'ソース 架空日報 朝刊');
    await user.type(screen.getByLabelText('証言が述べる日時：最も早い時点'), '1998-08-13');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personId: 'person-neighbor' },
      sourceId: 'source-newspaper',
      content:
        '@[隣家の住人](person:person-neighbor): 翌朝、@[湖畔の別荘](place:place-villa)の郵便受けに@[別荘の持ち主](person:person-owner)あての新聞が残っていた。@[持ち主が最後に目撃された](event:event-last-seen) @[架空日報 朝刊](source:source-newspaper)',
      eventId: 'event-last-seen',
      placeId: 'place-villa',
      mentionedPersonIds: ['person-owner'],
      when: { text: '1998-08-13', earliest: '1998-08-13' },
      assessment: 'unverified',
    });
    expect(onDone).toHaveBeenCalledOnce();
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

    await typeAndChoose(user, '@郵便配達員', '「郵便配達員」を人物として新規作成');
    await typeAndChoose(user, ': @湖畔駅', '「湖畔駅」を場所として新規作成');
    await typeAndChoose(user, 'で持ち主を見かけた。@配達員の手記', '「配達員の手記」をソースとして新規作成');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const { persons, places, sources } = useCaseStore.getState().currentCase;
    const 郵便配達員 = persons.find((person) => person.name === '郵便配達員');
    const 湖畔駅 = places.find((place) => place.name === '湖畔駅');
    const 手記 = sources.find((source) => source.title === '配達員の手記');
    expect(手記).toMatchObject({ kind: 'other' });
    expect(lastSavedClaim()).toMatchObject({
      speaker: { kind: 'person', personId: 郵便配達員?.id },
      placeId: 湖畔駅?.id,
      sourceId: 手記?.id,
    });
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

  it('入力中に、本文から読み取った発言者とソースを表示する', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    // 前提: メンションが無い本文はユーザーの推測として扱う
    expect(screen.getByLabelText('本文から読み取った参照')).toHaveTextContent('発言者ユーザーの推測');

    await typeAndChoose(user, '@管理', '人物 管理人');
    await typeAndChoose(user, ': 車は無かった。@湖畔の夏', /^ソース 湖畔の夏/);

    const summary = screen.getByLabelText('本文から読み取った参照');
    expect(summary).toHaveTextContent('発言者管理人');
    expect(summary).toHaveTextContent('ソース湖畔の夏 20年目の証言（架空の書籍）');
  });

  it('人物の証言にソースのメンションが無い場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await typeAndChoose(user, '@郵便配達員', '「郵便配達員」を人物として新規作成');
    await user.type(screen.getByLabelText('内容'), ': 出どころを示せない証言。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('人物の証言にはソースが必要です');
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('メンションの無い本文は、ユーザーの推測としてソースなしで保存できる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

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

  it('既存の主張を編集すると、同じIDのまま置き換える', async () => {
    const user = userEvent.setup();
    const 隣家の証言 = sampleFictionalCase.claims[1]!;
    render(<ClaimForm initial={隣家の証言} onDone={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('評価'), '疑わしい');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const { claims } = useCaseStore.getState().currentCase;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 隣家の証言.id)).toEqual({ ...隣家の証言, assessment: 'doubtful' });
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

  it('Escapeキーで候補を閉じ、入力した文字は残す', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('内容'), '@管理{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('内容')).toHaveValue('@管理');
  });
});
