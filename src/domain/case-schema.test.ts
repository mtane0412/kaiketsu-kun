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

    expect(parseCase(toJsonData(並び順の無い旧データ)).timelineOrder).toEqual([
      'claim:claim-arrival',
      'event:event-last-seen',
      'claim:claim-user-guess',
    ]);
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

  it('ユーザー以外の発言者による主張にソースが無い場合は拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[1], sourceId: undefined }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('ユーザーの推測以外の主張にはソースが必要です');
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
