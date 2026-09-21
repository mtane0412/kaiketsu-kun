/**
 * メンション（本文中の @ によるエンティティ参照）の解析・導出・下書き変換のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  claimToDraft,
  contentToDraft,
  contentToPlainText,
  deriveClaimLinks,
  draftToContent,
  findMentionQuery,
  formatMention,
  parseContent,
  parseDraft,
  resolveContent,
  stripLegacySpeakerPrefix,
  type DraftMention,
} from './mention';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Claim } from './types';

const 隣家の住人: DraftMention = { kind: 'person', id: 'person-neighbor', label: '隣家の住人' };
const 管理人: DraftMention = { kind: 'person', id: 'person-caretaker', label: '管理人' };
const 持ち主: DraftMention = { kind: 'person', id: 'person-owner', label: '別荘の持ち主' };
const 別荘: DraftMention = { kind: 'place', id: 'place-villa', label: '湖畔の別荘' };

describe('parseContent', () => {
  it('本文を、文字列とメンションの並びに分解する', () => {
    const content = `庭に${formatMention(持ち主)}の姿が見えた。`;

    expect(parseContent(content)).toEqual([
      { type: 'text', text: '庭に' },
      { type: 'mention', kind: 'person', id: 'person-owner', label: '別荘の持ち主' },
      { type: 'text', text: 'の姿が見えた。' },
    ]);
  });

  it('メンションを含まない本文は、1つの文字列として返す', () => {
    expect(parseContent('車も無かった。')).toEqual([{ type: 'text', text: '車も無かった。' }]);
  });
});

describe('contentToPlainText', () => {
  it('メンションを「@現在の名前」に置き換える（改名後は保存時の表示名ではなく現在の名前を使う）', () => {
    const 改名前の本文 = '庭に@[持ち主](person:person-owner)の姿が見えた。';

    expect(contentToPlainText(改名前の本文, sampleFictionalCase)).toBe('庭に@別荘の持ち主の姿が見えた。');
  });
});

describe('deriveClaimLinks', () => {
  it('本文のメンションから、場所・言及している人物を導出する（発言者と経由は本文から導出しない）', () => {
    const content = `夜9時ごろ、${formatMention(別荘)}の庭に${formatMention(持ち主)}の姿が見えた。`;

    expect(deriveClaimLinks(content)).toEqual({
      placeId: 'place-villa',
      mentionedPersonIds: ['person-owner'],
    });
  });

  it('本文の先頭に「@人物:」と書いても発言者として扱わず、言及している人物に含める', () => {
    // 発言者は入力欄の「発言者」で選ぶため、本文の書き方で発言者が決まることはない
    const content = `${formatMention(隣家の住人)}: 新聞が残っていた。`;

    expect(deriveClaimLinks(content)).toEqual({ mentionedPersonIds: ['person-neighbor'] });
  });

  it('同じ種類のメンションが複数ある場合は最初のものを採用し、人物の重複は1件にまとめる', () => {
    const 駅: DraftMention = { kind: 'place', id: 'place-station', label: '駅' };
    const content = `${formatMention(持ち主)}は${formatMention(別荘)}から${formatMention(駅)}へ向かった。${formatMention(持ち主)}は戻らなかった。`;

    const links = deriveClaimLinks(content);

    expect(links.placeId).toBe('place-villa');
    expect(links.mentionedPersonIds).toEqual(['person-owner']);
  });
});

describe('stripLegacySpeakerPrefix', () => {
  it('発言者を本文の先頭に「@人物:」と書いていた頃の本文から、発言者の記法を取り除く', () => {
    const content = `${formatMention(隣家の住人)}: 庭に${formatMention(持ち主)}の姿が見えた。`;

    expect(stripLegacySpeakerPrefix(content, { kind: 'person', personIds: ['person-neighbor'] })).toBe(
      `庭に${formatMention(持ち主)}の姿が見えた。`
    );
  });

  it('複数の発言者を空白や読点で並べた記法と、全角のコロンも取り除く', () => {
    const content = `${formatMention(隣家の住人)}、${formatMention(管理人)}：新聞が残っていた。`;

    expect(
      stripLegacySpeakerPrefix(content, { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] })
    ).toBe('新聞が残っていた。');
  });

  it('先頭の人物が項目の発言者に含まれない場合は、本文を変えない（発言者の記法ではなく文章とみなす）', () => {
    const content = `${formatMention(持ち主)}: この人物についてのメモ。`;

    expect(stripLegacySpeakerPrefix(content, { kind: 'person', personIds: ['person-neighbor'] })).toBe(content);
    expect(stripLegacySpeakerPrefix(content, { kind: 'user' })).toBe(content);
  });

  it('先頭の人物の直後がコロンでない本文は変えない', () => {
    const content = `${formatMention(隣家の住人)}は時刻を勘違いしているのではないか。`;

    expect(stripLegacySpeakerPrefix(content, { kind: 'person', personIds: ['person-neighbor'] })).toBe(content);
  });
});

describe('draftToContent', () => {
  it('入力欄の「@表示名」を、登録済みのメンションに限ってトークンに変換する', () => {
    const text = '@隣家の住人: 庭に@別荘の持ち主の姿が見えた。連絡先は info@example.co.jp';

    expect(draftToContent({ text, mentions: [隣家の住人, 持ち主] })).toBe(
      `${formatMention(隣家の住人)}: 庭に${formatMention(持ち主)}の姿が見えた。連絡先は info@example.co.jp`
    );
  });

  it('表示名が前方一致で重なる場合は、長い表示名を優先する', () => {
    const 山田: DraftMention = { kind: 'person', id: 'person-yamada', label: '山田' };
    const 山田花子: DraftMention = { kind: 'person', id: 'person-yamada-hanako', label: '山田花子' };

    expect(draftToContent({ text: '@山田花子が来た。', mentions: [山田, 山田花子] })).toBe(
      `${formatMention(山田花子)}が来た。`
    );
  });
});

describe('parseDraft', () => {
  it('下書きを、文字列と登録済みのメンションの並びに分解する（入力欄の色づけと一括削除に使う）', () => {
    const text = '@隣家の住人: 庭に@別荘の持ち主の姿が見えた。連絡先は info@example.co.jp';

    expect(parseDraft({ text, mentions: [隣家の住人, 持ち主] })).toEqual([
      { type: 'mention', ...隣家の住人 },
      { type: 'text', text: ': 庭に' },
      { type: 'mention', ...持ち主 },
      { type: 'text', text: 'の姿が見えた。連絡先は info@example.co.jp' },
    ]);
  });

  it('メンションが登録されていない下書きは、1つの文字列として返す', () => {
    expect(parseDraft({ text: '@隣家の住人が来た。', mentions: [] })).toEqual([
      { type: 'text', text: '@隣家の住人が来た。' },
    ]);
  });
});

describe('claimToDraft', () => {
  it('サンプルのすべての証言は、下書きに変換して保存し直しても本文と参照が変わらない', () => {
    for (const claim of sampleFictionalCase.claims) {
      const content = draftToContent(claimToDraft(claim, sampleFictionalCase));
      const links = deriveClaimLinks(content);

      expect(content).toBe(claim.content);
      expect(links.placeId).toBe(claim.placeId);
      expect(links.mentionedPersonIds).toEqual(claim.mentionedPersonIds);
    }
  });

  it('メンション導入前の証言は、項目にだけ保存されていた参照を本文の末尾に補う（編集で参照を失わないため）', () => {
    // 発言者と経由は入力欄の「発言者」で扱うため、本文には補わない
    const 旧形式の証言: Claim = {
      id: 'claim-legacy',
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['person-newspaper'],
      content: '庭に持ち主の姿が見えた。',
      mentionedPersonIds: ['person-owner'],
      placeId: 'place-villa',
    };

    const draft = claimToDraft(旧形式の証言, sampleFictionalCase);

    expect(draft.text).toBe(
      '庭に持ち主の姿が見えた。 @別荘の持ち主 @湖畔の別荘'
    );
    expect(deriveClaimLinks(draftToContent(draft))).toEqual({
      placeId: 旧形式の証言.placeId,
      mentionedPersonIds: 旧形式の証言.mentionedPersonIds,
    });
  });
});

describe('contentToDraft', () => {
  it('メンションを含む文章（エンティティのメモなど）を、現在の名前の下書きに変換する', () => {
    // 前提: トークンに控えた表示名「管理人さん」は古く、エンティティの現在の名前は「管理人」である
    const メモ = '@[管理人さん](person:person-caretaker)を雇い、@[湖畔の別荘](place:place-villa)の手入れを任せていた。';

    const draft = contentToDraft(メモ, sampleFictionalCase);

    expect(draft).toEqual({
      text: '@管理人を雇い、@湖畔の別荘の手入れを任せていた。',
      mentions: [管理人, 別荘],
    });
  });

  it('メンションを含まない文章は、そのままの文字列の下書きになる', () => {
    expect(contentToDraft('組織です。', sampleFictionalCase)).toEqual({ text: '組織です。', mentions: [] });
  });
});

describe('findMentionQuery', () => {
  it('カーソルの直前にある「@」以降の文字列を、候補の検索語として返す', () => {
    const text = '庭に@持ち';

    expect(findMentionQuery(text, text.length, [])).toEqual({ start: 2, query: '持ち' });
  });

  it('「@」の直後では、空の検索語を返す', () => {
    expect(findMentionQuery('@', 1, [])).toEqual({ start: 0, query: '' });
  });

  it('「@」が無い場合と、検索語に空白や改行が含まれる場合は null を返す', () => {
    expect(findMentionQuery('庭に持ち', 4, [])).toBeNull();
    expect(findMentionQuery('@管理人 が見た', 8, [])).toBeNull();
  });

  it('確定済みのメンションに続けて文章を書いている間は null を返す（候補を開き直さないため）', () => {
    const text = '@別荘の持ち主の姿が';

    expect(findMentionQuery(text, text.length, ['別荘の持ち主'])).toBeNull();
  });
});

describe('resolveContent', () => {
  it('メンションに、エンティティの現在の名前と画像を載せる', () => {
    // 前提: 別荘の持ち主には画像を登録してあり、湖畔の別荘には画像が無い
    const 持ち主の画像 = 'data:image/jpeg;base64,AAAA';
    const 案件 = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner' ? { ...person, imageDataUrl: 持ち主の画像 } : person
      ),
    };

    const segments = resolveContent(`${formatMention(持ち主)}が${formatMention(別荘)}にいた。`, 案件);

    expect(segments[0]).toEqual({
      type: 'mention',
      kind: 'person',
      id: 'person-owner',
      label: '別荘の持ち主',
      imageDataUrl: 持ち主の画像,
      iconText: '別',
    });
    expect(segments[2]).toEqual({ type: 'mention', kind: 'place', id: 'place-villa', label: '湖畔の別荘' });
  });

  it('人物のメンションには、アイコンの文字を載せる（場所のメンションには載せない）', () => {
    // 前提: 別荘の持ち主にはアイコンの文字「主」を指定してあり、画像は無い
    const 案件 = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner' ? { ...person, iconText: '主' } : person
      ),
    };

    const segments = resolveContent(`${formatMention(持ち主)}が${formatMention(別荘)}にいた。`, 案件);

    expect(segments[0]).toEqual({ type: 'mention', kind: 'person', id: 'person-owner', label: '別荘の持ち主', iconText: '主' });
    expect(segments[2]).toEqual({ type: 'mention', kind: 'place', id: 'place-villa', label: '湖畔の別荘' });
  });
});
