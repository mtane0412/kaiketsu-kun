/**
 * LLM が聴取の本文から抽出した証言の候補を、原文とケースに照らし合わせるロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildClaimCandidates,
  ambiguousNamesOf,
  candidateToClaimDraft,
  candidateToAddedSource,
  chooseAmbiguousPerson,
  ExtractionResultSchema,
  MAX_EXISTING_CLAIMS_FOR_EXTRACTION,
  selectExistingClaimsForExtraction,
  type ExtractedClaim,
} from './claim-extraction';
import type { Case, Claim, Interview } from './types';

/** 新聞の記事の本文です。警察の発表・目撃者の話・記者の地の文が混ざります。 */
const articleTranscript = [
  '湖畔の別荘で12日夜、所有者の男性が倒れているのが見つかった。',
  '県警によると、男性は21時ごろに死亡したとみられる。',
  '近くに住む山田花子さんは「庭に黒い車が止まっていた」と話した。',
].join('\n');

/** 新聞（資料の媒体）・県警・山田花子・別荘を登録したケースです。 */
function createCase(overrides: Partial<Case> = {}): Case {
  const interview: Interview = { id: 'interview-article', interviewerPersonId: 'person-newspaper', transcript: articleTranscript };
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
    disputes: [],
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
    sameClaimIds: [],
    ...overrides,
  };
}

/** 県警の広報担当が、山田花子さんと同姓同名（別名「山田 花子」）であるケースです。 */
function caseWithNamesake(): Case {
  const base = createCase();
  return {
    ...base,
    persons: [...base.persons, { id: 'person-hanako-police', name: '県警の広報担当', kind: 'individual', aliases: ['山田 花子'] }],
  };
}

/** 「山田 花子」が2人に一致して、どちらか決められない名前です。 */
function ambiguousHanako(name: string) {
  return {
    status: 'ambiguous',
    name,
    matches: [
      { id: 'person-hanako', name: '山田 花子' },
      { id: 'person-hanako-police', name: '県警の広報担当' },
    ],
  };
}

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
    const target = createCase({ interviews: [{ id: 'interview-video', transcript: videoTranscript }] });

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

  it('この資料での呼び方を、人物の名前・別名より優先して照らし合わせる', () => {
    // 前提: この記事は山田花子さんを「近所の女性」と書き、「県警」という呼び方は湖の管理事務所を指す（架空の例）
    const base = createCase();
    const target: Case = {
      ...base,
      persons: [...base.persons, { id: 'person-office', name: '湖の管理事務所', kind: 'organization' }],
      interviews: base.interviews.map((interview) => ({
        ...interview,
        personNames: [
          { name: '近所の女性', personId: 'person-hanako' },
          { name: '県警', personId: 'person-office' },
        ],
      })),
    };

    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: '近所の女性', viaNames: ['県警'] }),
    ]).candidates;

    expect(candidate?.speaker).toEqual({ status: 'registered', id: 'person-hanako', name: '山田 花子' });
    expect(candidate?.via).toEqual([{ status: 'registered', id: 'person-office', name: '湖の管理事務所' }]);
  });

  it('名前・別名が2人以上に一致した場合は、1人に決めず、一致した人物を候補として示す（同姓同名で別人に結び付けないため）', () => {
    const [candidate] = buildClaimCandidates(caseWithNamesake(), 'interview-article', [
      extracted({ speakerName: '山田 花子', mentionedPersonNames: ['山田　花子'] }),
    ]).candidates;

    expect(candidate?.speaker).toEqual(ambiguousHanako('山田 花子'));
    expect(candidate?.mentioned).toEqual([ambiguousHanako('山田　花子')]);
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
      content: '黒い車を見た',
      mentionedPersonIds: [],
      sources: [{ interviewId: 'interview-article', viaPersonIds: ['person-newspaper'], quote: { text: '「庭に黒い車が' } }],
    };
    const { candidates } = buildClaimCandidates(createCase({ claims: [transcribed] }), 'interview-article', [
      extracted({ quote: '庭に黒い車が止まっていた' }),
      extracted({ quote: '県警によると' }),
    ]);

    expect(candidates.map((candidate) => candidate.overlapsTranscribed)).toEqual([true, false]);
  });

  it('2つ目以降の出典でこの資料を引用した証言とも、範囲の重なりを照らし合わせる', () => {
    const transcribed: Claim = {
      id: 'claim-transcribed',
      speaker: { kind: 'person', personIds: ['person-hanako'] },
      content: '黒い車を見た',
      mentionedPersonIds: [],
      sources: [
        { interviewId: 'interview-other', viaPersonIds: [] },
        { interviewId: 'interview-article', viaPersonIds: ['person-newspaper'], quote: { text: '庭に黒い車が' } },
      ],
    };
    const target = createCase({ claims: [transcribed] });
    const { candidates } = buildClaimCandidates(
      { ...target, interviews: [...target.interviews, { id: 'interview-other' }] },
      'interview-article',
      [extracted({ quote: '庭に黒い車が止まっていた' })]
    );

    expect(candidates[0]?.overlapsTranscribed).toBe(true);
  });

  it('LLM が示した「同じかもしれない既存の証言」のうち、ケースにある証言だけを候補に持たせる', () => {
    // 前提: 別の新聞の記事から、山田花子さんの同じ話をすでに登録している
    const registered: Claim = {
      id: 'claim-hanako-other-paper',
      speaker: { kind: 'person', personIds: ['person-hanako'] },
      content: '庭に黒い車が止まっていた',
      mentionedPersonIds: [],
      sources: [],
    };
    const { candidates } = buildClaimCandidates(createCase({ claims: [registered] }), 'interview-article', [
      extracted({ sameClaimIds: ['claim-hanako-other-paper', 'claim-made-up-by-llm', 'claim-hanako-other-paper'] }),
    ]);

    // 検証: LLM がでっち上げたIDは捨て、重複したIDは1つにまとめる
    expect(candidates[0]?.sameClaimIds).toEqual(['claim-hanako-other-paper']);
  });

  it('本文の無い聴取は照らし合わせられないため、エラーにする', () => {
    const target = createCase({ interviews: [{ id: 'interview-empty' }] });
    expect(() => buildClaimCandidates(target, 'interview-empty', [])).toThrow('本文');
  });
});

describe('ambiguousNamesOf と chooseAmbiguousPerson', () => {
  /** 発言者と言及の両方に、決められない「山田 花子」が現れる候補です。 */
  function ambiguousCandidate() {
    const [candidate] = buildClaimCandidates(caseWithNamesake(), 'interview-article', [
      extracted({ speakerName: '山田 花子', viaNames: ['県警'], mentionedPersonNames: ['山田　花子'] }),
    ]).candidates;
    if (candidate === undefined) throw new Error('前提: 候補が1件ある');
    return candidate;
  }

  it('決められない名前を、正規化した名前ごとに1件ずつ、一致した人物とともに返す', () => {
    expect(ambiguousNamesOf(ambiguousCandidate())).toEqual([ambiguousHanako('山田 花子')]);
  });

  it('ユーザーが選んだ人物を、同じ名前（正規化後）のすべての位置に当てはめる', () => {
    const chosen = chooseAmbiguousPerson(ambiguousCandidate(), '山田 花子', 'person-hanako-police');

    const policeSpokesperson = { status: 'registered', id: 'person-hanako-police', name: '県警の広報担当' };
    expect(chosen.speaker).toEqual(policeSpokesperson);
    expect(chosen.mentioned).toEqual([policeSpokesperson]);
    expect(chosen.via).toEqual([{ status: 'registered', id: 'person-police', name: '県警' }]);
    expect(ambiguousNamesOf(chosen)).toEqual([]);
  });

  it('一致した人物に含まれない人物は選べない', () => {
    expect(() => chooseAmbiguousPerson(ambiguousCandidate(), '山田 花子', 'person-police')).toThrow(/person-police/);
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

  it('媒体が発言者でも経由でもない場合は、経由の最後に媒体を足す（媒体を通じて伝わった発言のため）', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [extracted({ speakerName: '県警', quote: '県警によると' })])
      .candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.speaker).toEqual({ personIds: ['person-police'], viaPersonIds: ['person-newspaper'] });
  });

  describe('転載の原典を持つ資料（湖畔新聞の記事を、ジャーナリストのブログが転載したもの）', () => {
    /** 湖畔新聞の記事を、ジャーナリストがブログに転載した資料のケースです。 */
    function createReprintCase(): Case {
      const base = createCase();
      return {
        ...base,
        persons: [...base.persons, { id: 'person-journalist', name: '転載したジャーナリスト', kind: 'individual' }],
        interviews: [
          {
            id: 'interview-article',
            interviewerPersonId: 'person-journalist',
            origin: { publisherPersonId: 'person-newspaper', publishedAt: '1998-08-14' },
            transcript: articleTranscript,
          },
        ],
      };
    }

    it('発言者のいる候補は、経由の最後に原典の媒体と転載した媒体をこの順に足す', () => {
      const target = createReprintCase();
      const [candidate] = buildClaimCandidates(target, 'interview-article', [extracted({ speakerName: '県警', quote: '県警によると' })])
        .candidates;

      const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

      expect(result.speaker).toEqual({ personIds: ['person-police'], viaPersonIds: ['person-newspaper', 'person-journalist'] });
    });

    it('候補の経由に転載した媒体が先に挙がっていても、媒体は「原典の媒体 → 転載した媒体」の順に並べる', () => {
      // 前提: LLM が経由に転載したジャーナリストだけを挙げた候補
      const target = createReprintCase();
      const [candidate] = buildClaimCandidates(target, 'interview-article', [
        extracted({ speakerName: '県警', viaNames: ['転載したジャーナリスト'], quote: '県警によると' }),
      ]).candidates;

      const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

      expect(result.speaker).toEqual({ personIds: ['person-police'], viaPersonIds: ['person-newspaper', 'person-journalist'] });
    });

    it('発言者の分からない候補（記者の地の文）は、原典の媒体を発言者にし、転載した媒体を経由にする', () => {
      const target = createReprintCase();
      const [candidate] = buildClaimCandidates(target, 'interview-article', [
        extracted({ speakerName: null, quote: '所有者の男性が倒れているのが見つかった' }),
      ]).candidates;

      const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

      expect(result.speaker).toEqual({ personIds: ['person-newspaper'], viaPersonIds: ['person-journalist'] });
    });
  });

  it('発言者の分からない候補（記者の地の文など）は、媒体を発言者にする', () => {
    const target = createCase();
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: null, quote: '所有者の男性が倒れているのが見つかった' }),
    ]).candidates;

    const result = candidateToClaimDraft(target, 'interview-article', candidate!, sequentialIds());

    expect(result.speaker).toEqual({ personIds: ['person-newspaper'], viaPersonIds: [] });
  });

  it('媒体の無い資料では、経由を足さず、発言者の分からない候補は発言者を選ばずにおく', () => {
    // 前提: URLと本文だけを登録した資料で、媒体をまだ選んでいない
    const target = createCase({ interviews: [{ id: 'interview-article', transcript: articleTranscript }] });
    const { candidates } = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: '県警', quote: '県警によると' }),
      extracted({ speakerName: null, quote: '所有者の男性が倒れているのが見つかった' }),
    ]);

    const [police, narration] = candidates.map((candidate) => candidateToClaimDraft(target, 'interview-article', candidate, sequentialIds()));

    expect(police?.speaker).toEqual({ personIds: ['person-police'], viaPersonIds: [] });
    expect(narration?.speaker).toEqual({ personIds: [], viaPersonIds: [] });
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

  it('決められない名前が残っている候補は、入力欄の初期値にせずエラーにする（ユーザーが人物を選んでから保存するため）', () => {
    const [candidate] = buildClaimCandidates(caseWithNamesake(), 'interview-article', [extracted({ speakerName: '山田 花子' })]).candidates;
    if (candidate === undefined) throw new Error('前提: 候補が1件ある');

    expect(() => candidateToClaimDraft(caseWithNamesake(), 'interview-article', candidate, sequentialIds())).toThrow(/山田 花子/);
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

describe('candidateToAddedSource', () => {
  /** テストで予測できるよう、新規作成するエンティティのIDを順番に振ります。 */
  function sequentialIds() {
    let count = 0;
    return () => `new-${++count}`;
  }

  /** 県警が発言者の、登録済みの証言です。 */
  const policeClaim: Claim = {
    id: 'claim-police',
    speaker: { kind: 'person', personIds: ['person-police'] },
    sources: [],
    content: '男性は21時ごろに死亡した',
    mentionedPersonIds: [],
  };

  it('発言者の分からない候補（記者の地の文）を既存の証言に書き足すと、媒体を経由に残す', () => {
    // 前提: 湖畔新聞の地の文として抽出された候補を、県警の既存の証言と同じだとユーザーが判断した
    const target = createCase({ claims: [policeClaim] });
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: null, quote: '所有者の男性が倒れているのが見つかった' }),
    ]).candidates;

    const result = candidateToAddedSource(target, 'interview-article', candidate!, policeClaim, sequentialIds());

    // 検証: 県警の発言は湖畔新聞を通じて伝わったため、経由に湖畔新聞が入る
    expect(result.source).toEqual({
      interviewId: 'interview-article',
      viaPersonIds: ['person-newspaper'],
      quote: { text: '所有者の男性が倒れているのが見つかった' },
    });
    expect(result.newEntities).toEqual([]);
  });

  it('経由から既存の証言の発言者を除き、未登録の経由の人物だけを新規作成する', () => {
    // 前提: 候補は「県警の発表を、捜査関係者（未登録）を通じて新聞が報じた」形
    const target = createCase({ claims: [policeClaim] });
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: '県警', viaNames: ['捜査関係者', '県警'], quote: '県警によると' }),
    ]).candidates;

    const result = candidateToAddedSource(target, 'interview-article', candidate!, policeClaim, sequentialIds());

    // 検証: 発言者の県警は経由に入らず、捜査関係者 → 湖畔新聞の順になる
    expect(result.source.viaPersonIds).toEqual(['new-1', 'person-newspaper']);
    expect(result.newEntities).toEqual([{ kind: 'person', id: 'new-1', name: '捜査関係者' }]);
  });

  it('候補の発言者が既存の証言の発言者と違う場合は、候補の発言者を経由の先頭に残す', () => {
    // 前提: この資料では「山田花子が（県警の発表を）話した」形で載っていた候補を、県警の既存の証言と同じだとユーザーが判断した
    const target = createCase({ claims: [policeClaim] });
    const [candidate] = buildClaimCandidates(target, 'interview-article', [
      extracted({ speakerName: '山田 花子', quote: '庭に黒い車が止まっていた' }),
    ]).candidates;

    const result = candidateToAddedSource(target, 'interview-article', candidate!, policeClaim, sequentialIds());

    // 検証: 山田花子が伝えた手がかりを失わないよう、山田花子 → 湖畔新聞 の順の経由にする
    expect(result.source.viaPersonIds).toEqual(['person-hanako', 'person-newspaper']);
  });
});

describe('selectExistingClaimsForExtraction', () => {
  /** 山田花子さんの話を、別の新聞から登録した証言です。 */
  const hanakoClaim: Claim = {
    id: 'claim-hanako',
    speaker: { kind: 'person', personIds: ['person-hanako'] },
    title: '黒い車',
    content: '@[湖畔の別荘](place:place-villa)の庭に黒い車が止まっていた\n（2行目）',
    mentionedPersonIds: [],
    placeId: 'place-villa',
    sources: [{ viaPersonIds: ['person-newspaper'] }],
  };
  /** 本文に名前の出てこない人物・場所だけに触れる証言です。 */
  const unrelatedClaim: Claim = {
    id: 'claim-unrelated',
    speaker: { kind: 'person', personIds: ['person-unrelated'] },
    content: '湖の水位は例年どおりだった',
    mentionedPersonIds: [],
    sources: [],
  };

  /** 本文に名前の出てこない人物を加えたケースです。 */
  function caseWith(claims: Claim[]): Case {
    const target = createCase({ claims });
    return { ...target, persons: [...target.persons, { id: 'person-unrelated', name: '湖の管理事務所', kind: 'organization' }] };
  }

  it('本文に名前（別名を含む）が出てくる人物・場所に触れる証言だけを、発言者・経由・内容の要約とともに返す', () => {
    const result = selectExistingClaimsForExtraction(caseWith([hanakoClaim, unrelatedClaim]), 'interview-article', articleTranscript);

    // 検証: 要約は改行を含めず、発言者と経由・見出し・本文を1行にまとめる
    expect(result).toEqual([{ id: 'claim-hanako', summary: '山田 花子（湖畔新聞 による）: 黒い車 — 湖畔の別荘の庭に黒い車が止まっていた （2行目）' }]);
  });

  it('この資料での呼び方が本文に出てくる人物にも、触れる証言を返す', () => {
    // 前提: 本文の「近くに住む」の人物を、この資料での呼び方「近くに住む女性」として湖の管理事務所に結び付けた（架空の例）
    const base = caseWith([unrelatedClaim]);
    const target: Case = {
      ...base,
      interviews: base.interviews.map((interview) => ({
        ...interview,
        personNames: [{ name: '近くに住む', personId: 'person-unrelated' }],
      })),
    };

    expect(selectExistingClaimsForExtraction(target, 'interview-article', articleTranscript).map((claim) => claim.id)).toEqual([
      'claim-unrelated',
    ]);
  });

  it('この資料をすでに出典に持つ証言は返さない（同じ資料の重なりは、書き起こし済みの印で示すため）', () => {
    const sameInterview: Claim = { ...hanakoClaim, sources: [{ interviewId: 'interview-article', viaPersonIds: ['person-newspaper'] }] };

    expect(selectExistingClaimsForExtraction(caseWith([sameInterview]), 'interview-article', articleTranscript)).toEqual([]);
  });

  it(`多くの証言が当てはまる場合は、本文に出てくる名前を多く含む順に、最大 ${MAX_EXISTING_CLAIMS_FOR_EXTRACTION} 件までにする`, () => {
    const manyClaims: Claim[] = Array.from({ length: MAX_EXISTING_CLAIMS_FOR_EXTRACTION }, (_, index) => ({
      ...hanakoClaim,
      id: `claim-hanako-${index}`,
      placeId: undefined,
      content: `山田花子さんの話（${index + 1}件目）`,
    }));
    const policeAndHanako: Claim = { ...hanakoClaim, id: 'claim-police-and-hanako', mentionedPersonIds: ['person-police'] };

    const result = selectExistingClaimsForExtraction(caseWith([...manyClaims, policeAndHanako]), 'interview-article', articleTranscript);

    expect(result).toHaveLength(MAX_EXISTING_CLAIMS_FOR_EXTRACTION);
    expect(result[0]?.id).toBe('claim-police-and-hanako');
  });
});
