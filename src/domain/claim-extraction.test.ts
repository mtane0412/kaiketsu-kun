/**
 * LLM が聴取の本文から抽出した証言の候補を、原文とケースに照らし合わせるロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildClaimCandidates,
  candidateToClaimDraft,
  ExtractionResultSchema,
  normalizeName,
  type ExtractedClaim,
} from './claim-extraction';
import type { Case, Claim, Interview } from './types';

/** 新聞の記事の本文です。警察の発表・目撃者の話・記者の地の文が混ざります。 */
const articleTranscript = [
  '湖畔の別荘で12日夜、所有者の男性が倒れているのが見つかった。',
  '県警によると、男性は21時ごろに死亡したとみられる。',
  '近くに住む山田花子さんは「庭に黒い車が止まっていた」と話した。',
].join('\n');

/** 新聞（聴取の相手）・県警・山田花子・別荘を登録したケースです。 */
function createCase(overrides: Partial<Case> = {}): Case {
  const interview: Interview = { id: 'interview-article', subjectPersonId: 'person-newspaper', transcript: articleTranscript };
  return {
    id: 'case-1',
    name: '湖畔の別荘の事件',
    persons: [
      { id: 'person-newspaper', name: '湖畔新聞', kind: 'record' },
      { id: 'person-police', name: '県警', kind: 'organization', aliases: ['湖畔県警察'] },
      { id: 'person-hanako', name: '山田 花子', kind: 'individual' },
    ],
    places: [{ id: 'place-villa', name: '湖畔の別荘' }],
    claims: [],
    relationships: [],
    interviews: [interview],
    crossChecks: [],
    hypotheses: [],
    tasks: [],
    timelineOrder: [],
    personLaneOrder: [],
    ...overrides,
  };
}

/** 空欄の多い候補に、テストで必要な項目だけを上書きして作ります。 */
function extracted(overrides: Partial<ExtractedClaim>): ExtractedClaim {
  return {
    speakerName: null,
    viaNames: [],
    title: null,
    content: '庭に黒い車が止まっていた',
    quote: '庭に黒い車が止まっていた',
    when: null,
    placeName: null,
    mentionedPersonNames: [],
    ...overrides,
  };
}

describe('normalizeName', () => {
  it('前後の空白を除き、全角と連続の空白を半角1つにし、大文字小文字を区別しない', () => {
    expect(normalizeName('  山田　 花子 ')).toBe('山田 花子');
    expect(normalizeName('Lake Villa')).toBe(normalizeName('lake villa'));
  });
});

describe('ExtractionResultSchema', () => {
  it('形式に合う出力を受け付ける', () => {
    expect(ExtractionResultSchema.safeParse({ claims: [extracted({})] }).success).toBe(true);
  });

  it('引用の無い候補を受け付けない', () => {
    const { quote: _quote, ...withoutQuote } = extracted({});
    expect(ExtractionResultSchema.safeParse({ claims: [withoutQuote] }).success).toBe(false);
  });
});

describe('buildClaimCandidates', () => {
  it('引用が本文に一字一句ある候補だけを示し、見つからない候補を捨てた件数を返す', () => {
    const result = buildClaimCandidates(createCase(), 'interview-article', [
      extracted({ quote: '庭に黒い車が止まっていた' }),
      extracted({ quote: '庭に白い車が止まっていた' }),
      extracted({ quote: '' }),
    ]);

    expect(result.candidates.map((candidate) => candidate.quote.text)).toEqual(['庭に黒い車が止まっていた']);
    expect(result.discardedCount).toBe(2);
  });

  it('候補のキーは、LLM の出力の中での順番にする（捨てた候補があっても変わらない）', () => {
    const result = buildClaimCandidates(createCase(), 'interview-article', [
      extracted({ quote: '本文に無い引用' }),
      extracted({ quote: '庭に黒い車が止まっていた' }),
    ]);

    expect(result.candidates.map((candidate) => candidate.key)).toEqual(['1']);
  });

  it('動画の文字起こしでは、引用の位置から動画の位置（秒数）を補う', () => {
    const videoTranscript = ['0:00', 'こんばんは、管理人です', '1:05', 'あの夜は別荘が真っ暗でした'].join('\n');
    const target = createCase({ interviews: [{ id: 'interview-video', subjectPersonId: 'person-hanako', transcript: videoTranscript }] });

    const result = buildClaimCandidates(target, 'interview-video', [extracted({ quote: 'あの夜は別荘が真っ暗でした' })]);

    expect(result.candidates[0]?.quote).toEqual({ text: 'あの夜は別荘が真っ暗でした', seconds: 65 });
  });

  it('人物は名前・別名と、場所は名前と照らし合わせ、一致しない名前は新規作成の候補にする', () => {
    const [candidate] = buildClaimCandidates(createCase(), 'interview-article', [
      extracted({
        speakerName: '山田花子 ',
        viaNames: ['湖畔県警察'],
        placeName: '湖畔の別荘',
        mentionedPersonNames: ['別荘の所有者', '湖畔の別荘'],
      }),
    ]).candidates;

    // 「山田花子」は空白の有無を除いて「山田 花子」と一致しないため、新規作成の候補になる
    expect(candidate?.speaker).toEqual({ status: 'new', name: '山田花子' });
    expect(candidate?.via).toEqual([{ status: 'registered', id: 'person-police', name: '県警' }]);
    expect(candidate?.place).toEqual({ status: 'registered', id: 'place-villa', name: '湖畔の別荘' });
    // 場所の名前は人物として照らし合わせない
    expect(candidate?.mentioned).toEqual([
      { status: 'new', name: '別荘の所有者' },
      { status: 'new', name: '湖畔の別荘' },
    ]);
  });

  it('日時は本文のメンションと同じ表記で解釈し、解釈できない日時は時刻参照を持たない', () => {
    const { candidates } = buildClaimCandidates(createCase(), 'interview-article', [
      extracted({ when: '1998年8月12日21時' }),
      extracted({ when: '12日夜' }),
    ]);

    expect(candidates[0]?.when).toBe('1998-08-12T21:00');
    expect(candidates[1]?.when).toBeUndefined();
    expect(candidates[1]?.whenText).toBe('12日夜');
  });

  it('同じ聴取で書き起こし済みの引用と重なる候補に印を付ける', () => {
    const transcribed: Claim = {
      id: 'claim-transcribed',
      speaker: { kind: 'person', personIds: ['person-hanako'] },
      viaPersonIds: ['person-newspaper'],
      content: '黒い車を見た',
      mentionedPersonIds: [],
      interviewId: 'interview-article',
      quote: { text: '「庭に黒い車が' },
    };
    const { candidates } = buildClaimCandidates(createCase({ claims: [transcribed] }), 'interview-article', [
      extracted({ quote: '庭に黒い車が止まっていた' }),
      extracted({ quote: '県警によると' }),
    ]);

    expect(candidates.map((candidate) => candidate.overlapsTranscribed)).toEqual([true, false]);
  });

  it('本文の無い聴取は照らし合わせられないため、エラーにする', () => {
    const target = createCase({ interviews: [{ id: 'interview-empty', subjectPersonId: 'person-hanako' }] });
    expect(() => buildClaimCandidates(target, 'interview-empty', [])).toThrow('本文');
  });
});

describe('candidateToClaimDraft', () => {
  /** テストで予測できるよう、新規作成するエンティティのIDを順番に振ります。 */
  function sequentialIds() {
    let count = 0;
    return () => `new-${++count}`;
  }

  it('本文の中の人物・場所の名前を「@」のメンションにし、日時のメンションを先頭に置く', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({
        speakerName: '山田 花子',
        content: '湖畔の別荘の庭に黒い車が止まっていた',
        when: '1998年8月12日',
        placeName: '湖畔の別荘',
      }),
    ]).candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.draft).toEqual({
      text: '@1998年8月12日 @湖畔の別荘の庭に黒い車が止まっていた',
      mentions: [
        { kind: 'date', id: '1998-08-12', label: '1998年8月12日' },
        { kind: 'place', id: 'place-villa', label: '湖畔の別荘' },
      ],
    });
  });

  it('本文に名前が無い人物・場所（別名で書かれた場合など）は、本文の末尾にメンションとして足す', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: '県警', content: '男性は21時ごろに死亡した', mentionedPersonNames: ['湖畔県警察'], quote: '県警によると' }),
    ]).candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.draft.text).toBe('男性は21時ごろに死亡した @県警');
    expect(result.draft.mentions).toEqual([{ kind: 'person', id: 'person-police', label: '県警' }]);
  });

  it('聴取の相手が発言者でない場合は、経由の最後に聴取の相手を足す', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [extracted({ speakerName: '県警', quote: '県警によると' })])
      .candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.speaker).toEqual({ personIds: ['person-police'], viaPersonIds: ['person-newspaper'] });
  });

  it('発言者の分からない候補（記者の地の文など）は、聴取の相手を発言者にする', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: null, quote: '所有者の男性が倒れているのが見つかった' }),
    ]).candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.speaker).toEqual({ personIds: ['person-newspaper'], viaPersonIds: [] });
  });

  it('一致しない名前は、同じ名前ごとに1件だけ新規作成し、発言者・言及で同じIDを使う', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({
        speakerName: '別荘の管理人',
        content: '別荘の管理人は湖畔ホテルに泊まっていた',
        placeName: '湖畔ホテル',
        mentionedPersonNames: ['別荘の管理人'],
        quote: '近くに住む',
      }),
    ]).candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.newEntities).toEqual([
      { kind: 'person', id: 'new-1', name: '別荘の管理人' },
      { kind: 'place', id: 'new-2', name: '湖畔ホテル' },
    ]);
    expect(result.speaker).toEqual({ personIds: ['new-1'], viaPersonIds: ['person-newspaper'] });
    expect(result.draft.text).toBe('@別荘の管理人は@湖畔ホテルに泊まっていた');
  });

  it('見出しは前後の空白を除き、空の見出しは持たない', () => {
    const target = createCase();
    const [titled, untitled] = buildClaimCandidates(target, 'interview-article', [
      extracted({ title: ' 黒い車の目撃 ' }),
      extracted({ title: '  ' }),
    ]).candidates;

    expect(candidateToClaimDraft(target, 'interview-article', titled!, sequentialIds()).title).toBe('黒い車の目撃');
    expect(candidateToClaimDraft(target, 'interview-article', untitled!, sequentialIds()).title).toBeUndefined();
  });
});
