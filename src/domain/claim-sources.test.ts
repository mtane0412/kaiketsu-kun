/**
 * 証言の出典（Claim.sources）を読む・書き足す関数のテスト
 */
import { describe, expect, it } from 'vitest';
import { addClaimSource, interviewIdsOf, sourceForInterview, viaChainsOf, viaPersonIdsOf } from './claim-sources';
import type { Claim } from './types';

/** 県警の発表を、新聞Aと新聞B（ブログへの転載）がそれぞれ報じた証言です。 */
const reportedTwice: Claim = {
  id: 'claim-police-announcement',
  speaker: { kind: 'person', personIds: ['person-police'] },
  content: '遺体は16時に見つかったと発表した',
  mentionedPersonIds: [],
  sources: [
    { interviewId: 'interview-newspaper-a', viaPersonIds: ['person-newspaper-a'], quote: { text: '16時に発見' } },
    { interviewId: 'interview-blog', viaPersonIds: ['person-newspaper-b', 'person-journalist'] },
  ],
};

describe('viaChainsOf', () => {
  it('出典ごとの経由を、出典の順に返す', () => {
    expect(viaChainsOf(reportedTwice)).toEqual([['person-newspaper-a'], ['person-newspaper-b', 'person-journalist']]);
  });

  it('経由の無い出典（直接の供述）は含めない', () => {
    const claim: Claim = { ...reportedTwice, sources: [{ interviewId: 'interview-direct', viaPersonIds: [] }] };
    expect(viaChainsOf(claim)).toEqual([]);
  });

  it('同じ経由の出典が2つある場合は1つにまとめる', () => {
    const claim: Claim = {
      ...reportedTwice,
      sources: [
        { interviewId: 'interview-episode-1', viaPersonIds: ['person-youtuber'] },
        { interviewId: 'interview-episode-2', viaPersonIds: ['person-youtuber'] },
      ],
    };
    expect(viaChainsOf(claim)).toEqual([['person-youtuber']]);
  });
});

describe('viaPersonIdsOf', () => {
  it('すべての出典の経由の人物を、重複なく返す', () => {
    const claim: Claim = {
      ...reportedTwice,
      sources: [...reportedTwice.sources, { viaPersonIds: ['person-newspaper-a'] }],
    };
    expect(viaPersonIdsOf(claim)).toEqual(['person-newspaper-a', 'person-newspaper-b', 'person-journalist']);
  });
});

describe('interviewIdsOf', () => {
  it('資料を持つ出典の資料のIDを返す', () => {
    const claim: Claim = { ...reportedTwice, sources: [...reportedTwice.sources, { viaPersonIds: ['person-neighbor'] }] };
    expect(interviewIdsOf(claim)).toEqual(['interview-newspaper-a', 'interview-blog']);
  });
});

describe('sourceForInterview', () => {
  it('指定した資料の出典を返す', () => {
    expect(sourceForInterview(reportedTwice, 'interview-blog')?.viaPersonIds).toEqual(['person-newspaper-b', 'person-journalist']);
  });

  it('資料の出典が無い場合は undefined を返す', () => {
    expect(sourceForInterview(reportedTwice, 'interview-unknown')).toBeUndefined();
  });
});

describe('addClaimSource', () => {
  it('出典を末尾に書き足した証言を返す（元の証言は変えない）', () => {
    const source = { interviewId: 'interview-newspaper-c', viaPersonIds: ['person-newspaper-c'], quote: { text: '午後4時ごろ' } };
    const updated = addClaimSource(reportedTwice, source);
    expect(updated.sources).toEqual([...reportedTwice.sources, source]);
    expect(reportedTwice.sources).toHaveLength(2);
  });

  it('同じ資料の出典をすでに持つ場合は例外を投げる', () => {
    expect(() => addClaimSource(reportedTwice, { interviewId: 'interview-blog', viaPersonIds: [] })).toThrow(
      'この証言は、すでにこの資料を出典に持っています'
    );
  });

  it('ユーザーの推測に経由のある出典は書き足せない', () => {
    const guess: Claim = { ...reportedTwice, speaker: { kind: 'user' }, sources: [] };
    expect(() => addClaimSource(guess, { interviewId: 'interview-blog', viaPersonIds: ['person-journalist'] })).toThrow(
      'ユーザーの推測に経由は指定できません'
    );
  });
});
