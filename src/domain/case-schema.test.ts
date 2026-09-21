/**
 * 読み込んだ案件データの検証（形式・時刻表記・参照の整合性）のテスト
 */
import { describe, expect, it } from 'vitest';
import { parseCase } from './case-schema';
import { sampleFictionalCase } from './sample-fictional-case';

/** JSONの書き出し・読み込みを経たデータを再現します。 */
function toJsonData(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('parseCase', () => {
  it('正しい案件データをそのまま受け付ける', () => {
    expect(parseCase(toJsonData(sampleFictionalCase))).toEqual(sampleFictionalCase);
  });

  it('主張の見出しを保持して受け付ける', () => {
    // 前提: 隣家の住人の証言に、長い本文を要約する見出しを付けている
    const 案件 = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-neighbor' ? { ...claim, title: '夜9時に持ち主を庭で見た' } : claim
      ),
    };

    const 読み込み後 = parseCase(toJsonData(案件));

    expect(読み込み後.claims.find((claim) => claim.id === 'claim-neighbor')?.title).toBe('夜9時に持ち主を庭で見た');
  });

  it('並び順を持たない頃に保存したデータは、当時の表示順（日時の早い順）を並び順として補って受け付ける', () => {
    // 前提: 以前の版では、ボード上の位置を主張が述べる日時から決めており、timelineOrder を保存していなかった
    const { timelineOrder: _並び順, ...並び順の無い案件 } = sampleFictionalCase;
    const 並び順の無い旧データ = {
      ...並び順の無い案件,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-arrival',
          speaker: { kind: 'user' },
          content: '持ち主は8月10日に別荘に到着したはずだ。',
          mentionedPersonIds: [],
          when: { text: '8月10日', earliest: '1998-08-10' },
        },
      ],
    };

    // 検証: 日時を持つ主張を早い順に、次に日時を持たない主張を述べられた時点の早い順に並べる
    expect(parseCase(toJsonData(並び順の無い旧データ)).timelineOrder).toEqual([
      'claim:claim-arrival',
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });

  it('出来事に主張を束ねていた頃のデータは、束を解いて主張だけを並べる形に変換して受け付ける', () => {
    // 前提: 以前の版では、隣家の住人と管理人の証言を、出来事「持ち主が最後に目撃された」に束ねていた
    const 出来事を持つ旧データ = {
      ...sampleFictionalCase,
      events: [{ id: 'event-last-seen', title: '持ち主が最後に目撃された', description: '目撃の時刻が食い違う' }],
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-neighbor' || claim.id === 'claim-caretaker'
          ? { ...claim, eventId: 'event-last-seen', content: `${claim.content} @[持ち主が最後に目撃された](event:event-last-seen)` }
          : claim
      ),
      timelineOrder: ['claim:claim-police-camera', 'event:event-last-seen', 'claim:claim-report', 'claim:claim-user-guess'],
    };

    const 読み込み後 = parseCase(toJsonData(出来事を持つ旧データ));

    // 検証: 束の位置に、束ねていた主張が述べる日時の早い順（管理人の夜7時 → 隣家の住人の夜9時ごろ）で並ぶ。
    // 束の前にあった防犯カメラの記録（夜8時10分ごろ）は、束を解くと管理人の夜7時より前にあって日時と矛盾するため、矛盾しない位置へ動かす
    expect(読み込み後.timelineOrder).toEqual([
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
    expect(読み込み後).not.toHaveProperty('events');
    expect(読み込み後.claims).toEqual(sampleFictionalCase.claims);
  });

  it('評価を廃止する前に保存したデータは、主張の評価を取り除いて受け付ける', () => {
    // 前提: 以前の版では、主張ごとに assessment（信頼できる・疑わしい・未検証）を保存していた
    const 評価付きの旧データ = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) => ({ ...claim, assessment: 'credible' })),
    };

    // 検証: 読み込みに成功し、評価の項目は残らない
    expect(parseCase(toJsonData(評価付きの旧データ))).toEqual(sampleFictionalCase);
  });

  it('発言者を1人しか持てなかった頃のデータは、発言者を1人の一覧に変換して受け付ける', () => {
    // 前提: 以前の版では、人物の発言者を speaker.personId（1人）で保存していた
    const 旧データ = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.speaker.kind === 'person'
          ? { ...claim, speaker: { kind: 'person', personId: claim.speaker.personIds[0] } }
          : claim
      ),
    };

    expect(parseCase(toJsonData(旧データ))).toEqual(sampleFictionalCase);
  });

  it('発言者を本文の先頭に「@人物:」と書いていた頃のデータは、本文から発言者の記法を取り除いて受け付ける', () => {
    // 前提: 以前の版では、本文の先頭の「@人物:」から発言者を導出しており、本文に発言者の記法が残っている
    const 旧データ = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-newspaper-left',
          speaker: { kind: 'person', personIds: ['person-neighbor'] },
          viaPersonIds: ['person-newspaper'],
          content: '@[隣家の住人](person:person-neighbor): 郵便受けに新聞が残っていた。',
          mentionedPersonIds: [],
        },
      ],
      timelineOrder: [...sampleFictionalCase.timelineOrder, 'claim:claim-newspaper-left'],
    };

    const 読み込んだ主張 = parseCase(toJsonData(旧データ)).claims.at(-1);

    // 検証: 発言者は項目に残り、本文からは記法だけが消える
    expect(読み込んだ主張?.speaker).toEqual({ kind: 'person', personIds: ['person-neighbor'] });
    expect(読み込んだ主張?.content).toBe('郵便受けに新聞が残っていた。');
  });

  it('人物の発言者が1人もいない主張を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[1], speaker: { kind: 'person', personIds: [] } }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('案件データの形式が正しくありません');
  });

  it('発言者の1人が存在しない人物である主張を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: [
        { ...sampleFictionalCase.claims[1], speaker: { kind: 'person', personIds: ['person-neighbor', 'person-unknown'] } },
      ],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('存在しない人物を参照しています: person-unknown');
  });

  it('必須の項目が欠けているデータを拒否する', () => {
    const 主張一覧が無いデータ = { ...sampleFictionalCase, claims: undefined };

    expect(() => parseCase(toJsonData(主張一覧が無いデータ))).toThrow('案件データの形式が正しくありません');
  });

  it('解釈できない時刻表記を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) => ({ ...claim, when: { text: '8月12日', earliest: '1998年8月12日' } })),
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('earliest');
  });

  it('latestがearliestより前の時刻参照を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim) => ({
        ...claim,
        when: { text: '逆転', earliest: '1998-08', latest: '1998-07' },
      })),
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('latest が earliest より前です');
  });

  it('経由が存在しない人物を参照している主張を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[1], viaPersonIds: ['person-unknown'] }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('存在しない人物を参照しています: person-unknown');
  });

  it('ユーザーの推測に経由を指定した主張を拒否する', () => {
    // 経由は「誰かの発言を誰が伝えたか」を表すため、発言者がいないユーザーの推測には付けられない
    const 推測 = sampleFictionalCase.claims.find((claim) => claim.id === 'claim-user-guess')!;
    const データ = {
      ...sampleFictionalCase,
      claims: [...sampleFictionalCase.claims.filter((claim) => claim !== 推測), { ...推測, viaPersonIds: ['person-newspaper'] }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('ユーザーの推測に経由は指定できません: claim-user-guess');
  });

  it('存在しない人物を参照している主張を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[0], mentionedPersonIds: ['person-unknown'] }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('存在しない人物を参照しています: person-unknown');
  });

  it('本文のメンションが存在しない場所を参照している主張を拒否する', () => {
    // 2つ目以降の場所のメンションは placeId に現れないため、本文のトークン自体を検証する必要がある
    const データ = {
      ...sampleFictionalCase,
      claims: [
        {
          ...sampleFictionalCase.claims[3],
          content: '持ち主は@[湖畔の別荘](place:place-villa)から@[駅](place:place-unknown)へ向かったのではないか。',
        },
      ],
      relationships: [],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('存在しない場所を参照しています: place-unknown');
  });

  it('存在しない主張を根拠にしている関係を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      relationships: [{ ...sampleFictionalCase.relationships[0], basisClaimIds: ['claim-unknown'] }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('存在しない主張を参照しています: claim-unknown');
  });
});

/** ソース（Source）を人物とは別の種類のエンティティとして持っていた頃の案件データです。 */
const ソースを持つ旧データ = {
  id: 'case-legacy',
  name: 'ソースを持っていた頃の案件',
  sources: [
    {
      id: 'source-newspaper',
      title: '架空日報 朝刊',
      kind: 'article',
      url: 'https://example.co.jp/news/19980814',
      publishedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
      note: '社会面の記事',
    },
  ],
  persons: [{ id: 'person-neighbor', name: '隣家の住人' }],
  places: [],
  claims: [
    {
      id: 'claim-testimony',
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      sourceId: 'source-newspaper',
      locator: '社会面',
      content: '庭に人影が見えた。 @[架空日報 朝刊](source:source-newspaper)',
      mentionedPersonIds: [],
    },
    {
      id: 'claim-narration',
      speaker: { kind: 'source' },
      sourceId: 'source-newspaper',
      content: '持ち主と連絡が取れなくなっている。 @[架空日報 朝刊](source:source-newspaper)',
      mentionedPersonIds: [],
    },
    {
      id: 'claim-guess',
      speaker: { kind: 'user' },
      sourceId: 'source-newspaper',
      content: '@[架空日報 朝刊](source:source-newspaper)の記事は誤報ではないか。',
      mentionedPersonIds: [],
    },
  ],
  relationships: [],
  timelineOrder: ['claim:claim-testimony', 'claim:claim-narration', 'claim:claim-guess'],
};

describe('parseCase（ソースを人物に統合する前のデータ）', () => {
  it('ソースを人物に変換し、URL・公開時点・メモを人物のメモにまとめる', () => {
    const 読み込んだ案件 = parseCase(toJsonData(ソースを持つ旧データ));

    expect(読み込んだ案件.persons).toEqual([
      { id: 'person-neighbor', name: '隣家の住人' },
      {
        id: 'source-newspaper',
        name: '架空日報 朝刊',
        note: '社会面の記事\nhttps://example.co.jp/news/19980814\n公開・刊行: 1998年8月14日',
      },
    ]);
    expect(読み込んだ案件).not.toHaveProperty('sources');
  });

  it('人物の証言は、ソースを経由に移し、本文の末尾のソースのメンションを取り除く', () => {
    const 証言 = parseCase(toJsonData(ソースを持つ旧データ)).claims.find((claim) => claim.id === 'claim-testimony');

    // 検証: ソース内の位置（locator）は入力欄を廃止したが、値は失わない
    expect(証言).toEqual({
      id: 'claim-testimony',
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['source-newspaper'],
      locator: '社会面',
      content: '庭に人影が見えた。',
      mentionedPersonIds: [],
    });
  });

  it('ソース自体の記述は、ソースだった人物を発言者にする（経由は無し）', () => {
    const 記述 = parseCase(toJsonData(ソースを持つ旧データ)).claims.find((claim) => claim.id === 'claim-narration');

    expect(記述).toEqual({
      id: 'claim-narration',
      speaker: { kind: 'person', personIds: ['source-newspaper'] },
      viaPersonIds: [],
      content: '持ち主と連絡が取れなくなっている。',
      mentionedPersonIds: [],
    });
  });

  it('ユーザーの推測が言及していたソースは、本文の人物のメンションに変換する（発言者にも経由にもしない）', () => {
    const 推測 = parseCase(toJsonData(ソースを持つ旧データ)).claims.find((claim) => claim.id === 'claim-guess');

    expect(推測).toEqual({
      id: 'claim-guess',
      speaker: { kind: 'user' },
      viaPersonIds: [],
      content: '@[架空日報 朝刊](person:source-newspaper)の記事は誤報ではないか。',
      mentionedPersonIds: ['source-newspaper'],
    });
  });

  it('ソースと同じ名前の人物が登録済みの場合は、人物を増やさずにその人物へまとめる', () => {
    // 前提: 「県警」が人物としてもソースとしても登録されている
    const 旧データ = {
      ...ソースを持つ旧データ,
      sources: [{ id: 'source-police', title: '県警', kind: 'other', note: '記者発表' }],
      persons: [{ id: 'person-police', name: '県警', note: '組織です。' }],
      claims: [
        {
          id: 'claim-announcement',
          speaker: { kind: 'source' },
          sourceId: 'source-police',
          content: '捜索を始めた。 @[県警](source:source-police)',
          mentionedPersonIds: [],
        },
      ],
      timelineOrder: ['claim:claim-announcement'],
    };

    const 読み込んだ案件 = parseCase(toJsonData(旧データ));

    expect(読み込んだ案件.persons).toEqual([{ id: 'person-police', name: '県警', note: '組織です。\n記者発表' }]);
    expect(読み込んだ案件.claims[0]?.speaker).toEqual({ kind: 'person', personIds: ['person-police'] });
  });

  it('変換後のデータは、もう一度読み込んでも変わらない', () => {
    const 一度目 = parseCase(toJsonData(ソースを持つ旧データ));

    expect(parseCase(toJsonData(一度目))).toEqual(一度目);
  });
});
