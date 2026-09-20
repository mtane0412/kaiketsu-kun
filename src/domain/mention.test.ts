/**
 * メンション（本文中の @ によるエンティティ参照）の解析・導出・下書き変換のテスト
 */
import { describe, expect, it } from 'vitest';
import {
  claimToDraft,
  contentToPlainText,
  deriveClaimLinks,
  draftToContent,
  findMentionQuery,
  formatMention,
  parseContent,
  parseDraft,
  type DraftMention,
} from './mention';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Claim } from './types';

const 隣家の住人: DraftMention = { kind: 'person', id: 'person-neighbor', label: '隣家の住人' };
const 管理人: DraftMention = { kind: 'person', id: 'person-caretaker', label: '管理人' };
const 持ち主: DraftMention = { kind: 'person', id: 'person-owner', label: '別荘の持ち主' };
const 別荘: DraftMention = { kind: 'place', id: 'place-villa', label: '湖畔の別荘' };
const 目撃: DraftMention = { kind: 'event', id: 'event-last-seen', label: '持ち主が最後に目撃された' };
const 朝刊: DraftMention = { kind: 'source', id: 'source-newspaper', label: '架空日報 朝刊' };

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
  it('先頭の「@人物:」を発言者とし、残りのメンションから各参照を導出する', () => {
    const content = [
      `${formatMention(隣家の住人)}: 夜9時ごろ、${formatMention(別荘)}の庭に${formatMention(持ち主)}の姿が見えた。`,
      `${formatMention(目撃)} ${formatMention(朝刊)}`,
    ].join('');

    expect(deriveClaimLinks(content)).toEqual({
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      sourceId: 'source-newspaper',
      eventId: 'event-last-seen',
      placeId: 'place-villa',
      mentionedPersonIds: ['person-owner'],
    });
  });

  it('全角のコロンでも発言者として扱う', () => {
    const content = `${formatMention(隣家の住人)}：新聞が残っていた。`;

    expect(deriveClaimLinks(content).speaker).toEqual({ kind: 'person', personIds: ['person-neighbor'] });
  });

  it('先頭に人物のメンションが並び、その直後がコロンの場合は、全員を発言者とする', () => {
    // 前提: 1つの記事が、隣家の住人と管理人の2人が同じことを述べたと伝えている
    const content = `${formatMention(隣家の住人)} ${formatMention(管理人)}: 庭に${formatMention(持ち主)}の姿が見えた。${formatMention(朝刊)}`;

    expect(deriveClaimLinks(content)).toEqual({
      speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
      sourceId: 'source-newspaper',
      mentionedPersonIds: ['person-owner'],
    });
  });

  it('発言者の人物は読点（、）で区切ってもよく、同じ人物の重複は1件にまとめる', () => {
    const content = `${formatMention(隣家の住人)}、${formatMention(管理人)}、${formatMention(隣家の住人)}：新聞が残っていた。`;

    expect(deriveClaimLinks(content).speaker).toEqual({
      kind: 'person',
      personIds: ['person-neighbor', 'person-caretaker'],
    });
  });

  it('先頭の人物の並びに文章が挟まる場合は、発言者ではなく言及している人物として扱う', () => {
    // 「と」のような文章を挟むと、どこまでが発言者かを機械的に決められないため、発言者として扱わない
    const content = `${formatMention(隣家の住人)}と${formatMention(管理人)}: 新聞が残っていた。${formatMention(朝刊)}`;

    expect(deriveClaimLinks(content)).toEqual({
      speaker: { kind: 'source' },
      sourceId: 'source-newspaper',
      mentionedPersonIds: ['person-neighbor', 'person-caretaker'],
    });
  });

  it('先頭の人物の直後がコロンでない場合は、発言者ではなく言及している人物として扱う', () => {
    const content = `${formatMention(持ち主)}は12日夜から連絡が取れない。${formatMention(朝刊)}`;

    expect(deriveClaimLinks(content)).toEqual({
      speaker: { kind: 'source' },
      sourceId: 'source-newspaper',
      mentionedPersonIds: ['person-owner'],
    });
  });

  it('発言者もソースも無い本文は、ユーザーの推測として扱う', () => {
    const content = `${formatMention(隣家の住人)}は時刻を勘違いしているのではないか。`;

    expect(deriveClaimLinks(content)).toEqual({
      speaker: { kind: 'user' },
      mentionedPersonIds: ['person-neighbor'],
    });
  });

  it('同じ種類のメンションが複数ある場合は最初のものを採用し、人物の重複は1件にまとめる', () => {
    const 駅: DraftMention = { kind: 'place', id: 'place-station', label: '駅' };
    const content = `${formatMention(持ち主)}は${formatMention(別荘)}から${formatMention(駅)}へ向かった。${formatMention(持ち主)}は戻らなかった。`;

    const links = deriveClaimLinks(content);

    expect(links.placeId).toBe('place-villa');
    expect(links.mentionedPersonIds).toEqual(['person-owner']);
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
  it('サンプルのすべての主張は、下書きに変換して保存し直しても本文と参照が変わらない', () => {
    for (const claim of sampleFictionalCase.claims) {
      const content = draftToContent(claimToDraft(claim, sampleFictionalCase));
      const links = deriveClaimLinks(content);

      expect(content).toBe(claim.content);
      expect(links.speaker).toEqual(claim.speaker);
      expect(links.sourceId).toBe(claim.sourceId);
      expect(links.eventId).toBe(claim.eventId);
      expect(links.placeId).toBe(claim.placeId);
      expect(links.mentionedPersonIds).toEqual(claim.mentionedPersonIds);
    }
  });

  it('メンション導入前の主張は、項目にだけ保存されていた参照を本文に補う（編集で参照を失わないため）', () => {
    const 旧形式の主張: Claim = {
      id: 'claim-legacy',
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      sourceId: 'source-newspaper',
      content: '庭に持ち主の姿が見えた。',
      eventId: 'event-last-seen',
      mentionedPersonIds: ['person-owner'],
      placeId: 'place-villa',
    };

    const draft = claimToDraft(旧形式の主張, sampleFictionalCase);

    expect(draft.text).toBe(
      '@隣家の住人: 庭に持ち主の姿が見えた。 @別荘の持ち主 @持ち主が最後に目撃された @湖畔の別荘 @架空日報 朝刊'
    );
    expect(deriveClaimLinks(draftToContent(draft))).toEqual({
      speaker: 旧形式の主張.speaker,
      sourceId: 旧形式の主張.sourceId,
      eventId: 旧形式の主張.eventId,
      placeId: 旧形式の主張.placeId,
      mentionedPersonIds: 旧形式の主張.mentionedPersonIds,
    });
  });
});

describe('claimToDraft（発言者が複数の主張）', () => {
  it('本文にトークンを持たない主張は、発言者の全員を先頭に補う', () => {
    const 旧形式の主張: Claim = {
      id: 'claim-legacy-two-speakers',
      speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
      sourceId: 'source-newspaper',
      content: '別荘の明かりがついていた。',
      mentionedPersonIds: [],
    };

    const draft = claimToDraft(旧形式の主張, sampleFictionalCase);

    expect(draft.text).toBe('@隣家の住人 @管理人: 別荘の明かりがついていた。 @架空日報 朝刊');
    expect(deriveClaimLinks(draftToContent(draft)).speaker).toEqual(旧形式の主張.speaker);
  });
});

describe('claimToDraft（本文の発言者が項目より少ない主張）', () => {
  it('本文の先頭に書かれていない発言者を先頭に補う（編集で発言者を失わないため）', () => {
    // 前提: 手で編集したJSONなどで、項目の発言者は2人だが、本文の先頭には隣家の住人しか書かれていない
    const 主張: Claim = {
      id: 'claim-partial-speakers',
      speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
      sourceId: 'source-newspaper',
      content: `${formatMention(隣家の住人)}: 別荘の明かりがついていた。 ${formatMention(朝刊)}`,
      mentionedPersonIds: [],
    };

    const draft = claimToDraft(主張, sampleFictionalCase);

    expect(draft.text).toBe('@管理人 @隣家の住人: 別荘の明かりがついていた。 @架空日報 朝刊');
    const 保存後の発言者 = deriveClaimLinks(draftToContent(draft)).speaker;
    expect(保存後の発言者).toEqual({ kind: 'person', personIds: ['person-caretaker', 'person-neighbor'] });
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
