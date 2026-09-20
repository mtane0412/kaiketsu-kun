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

  it('必須の項目が欠けているデータを拒否する', () => {
    const 主張一覧が無いデータ = { ...sampleFictionalCase, claims: undefined };

    expect(() => parseCase(toJsonData(主張一覧が無いデータ))).toThrow('案件データの形式が正しくありません');
  });

  it('解釈できない時刻表記を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      events: [{ ...sampleFictionalCase.events[0], when: { text: '8月12日', earliest: '1998年8月12日' } }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('earliest');
  });

  it('latestがearliestより前の時刻参照を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      events: [{ ...sampleFictionalCase.events[0], when: { text: '逆転', earliest: '1998-08', latest: '1998-07' } }],
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

  it('存在しない主張を根拠にしている関係を拒否する', () => {
    const データ = {
      ...sampleFictionalCase,
      relationships: [{ ...sampleFictionalCase.relationships[0], basisClaimIds: ['claim-unknown'] }],
    };

    expect(() => parseCase(toJsonData(データ))).toThrow('存在しない主張を参照しています: claim-unknown');
  });
});
