/**
 * 型定義の書き心地を確かめるための架空の案件サンプル
 *
 * このファイルの人物・場所・出来事・資料はすべて架空です。
 * 次の4点が型で表現できることを確認する目的で作成しています。
 * - 同じ出来事について、2人の証言が述べる時刻が食い違うこと
 * - 出来事が起きた時点と、証言が述べられた時点が別の時間軸であること
 * - 発言者を特定できない報道の記述を主張として扱えること
 * - ユーザーの推測を証言と区別し、関係の根拠として参照できること
 *
 * 主張の本文（content）は、人物・場所・出来事・ソースへの参照を `@[表示名](種類:ID)` の形式で含みます。
 * 各主張の speaker・sourceId・eventId・placeId・mentionedPersonIds は、本文からの導出結果（src/domain/mention.ts）と一致させています。
 */
import type { Case } from './types';

export const sampleFictionalCase: Case = {
  id: 'case-lakeside',
  name: '湖畔の別荘失踪事件（架空）',
  sources: [
    {
      id: 'source-newspaper',
      title: '架空日報 朝刊',
      kind: 'article',
      publishedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
    },
    {
      id: 'source-book',
      title: '湖畔の夏 20年目の証言（架空の書籍）',
      kind: 'book',
      publishedAt: { text: '2018年', earliest: '2018-01-01', latest: '2018-12-31' },
    },
  ],
  persons: [
    { id: 'person-owner', name: '別荘の持ち主' },
    { id: 'person-neighbor', name: '隣家の住人' },
    { id: 'person-caretaker', name: '管理人', aliases: ['元管理人'] },
  ],
  places: [{ id: 'place-villa', name: '湖畔の別荘' }],
  events: [
    {
      id: 'event-last-seen',
      title: '持ち主が最後に目撃された',
      when: { text: '1998年8月12日の夜', earliest: '1998-08-12T18:00', latest: '1998-08-12T23:59' },
      placeId: 'place-villa',
      participantIds: ['person-owner'],
    },
  ],
  claims: [
    {
      id: 'claim-report',
      speaker: { kind: 'source' },
      sourceId: 'source-newspaper',
      locator: '社会面',
      content: '@[別荘の持ち主](person:person-owner)は12日夜から連絡が取れなくなっている。@[持ち主が最後に目撃された](event:event-last-seen) @[架空日報 朝刊](source:source-newspaper)',
      statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
      eventId: 'event-last-seen',
      mentionedPersonIds: ['person-owner'],
      assessment: 'credible',
    },
    {
      id: 'claim-neighbor',
      speaker: { kind: 'person', personId: 'person-neighbor' },
      sourceId: 'source-newspaper',
      locator: '社会面',
      content: 
        '@[隣家の住人](person:person-neighbor): 夜9時ごろ、@[湖畔の別荘](place:place-villa)の明かりがついていて、庭に@[別荘の持ち主](person:person-owner)の姿が見えた。@[持ち主が最後に目撃された](event:event-last-seen) @[架空日報 朝刊](source:source-newspaper)',
      statedAt: { text: '1998年8月13日', earliest: '1998-08-13' },
      eventId: 'event-last-seen',
      mentionedPersonIds: ['person-owner'],
      when: { text: '8月12日 夜9時ごろ', earliest: '1998-08-12T20:30', latest: '1998-08-12T21:30' },
      placeId: 'place-villa',
      assessment: 'unverified',
    },
    {
      id: 'claim-caretaker',
      speaker: { kind: 'person', personId: 'person-caretaker' },
      sourceId: 'source-book',
      locator: '第3章 112ページ',
      content: 
        '@[管理人](person:person-caretaker): 夜7時に見回りをしたとき、@[湖畔の別荘](place:place-villa)はすでに真っ暗で、@[別荘の持ち主](person:person-owner)の車も無かった。@[持ち主が最後に目撃された](event:event-last-seen) @[湖畔の夏 20年目の証言（架空の書籍）](source:source-book)',
      statedAt: { text: '2018年', earliest: '2018-01-01', latest: '2018-12-31' },
      eventId: 'event-last-seen',
      mentionedPersonIds: ['person-owner'],
      when: { text: '8月12日 夜7時', earliest: '1998-08-12T19:00' },
      placeId: 'place-villa',
      assessment: 'doubtful',
    },
    {
      id: 'claim-user-guess',
      speaker: { kind: 'user' },
      content: 
        '@[管理人](person:person-caretaker)の証言は事件の20年後に初めて出たもので、@[隣家の住人](person:person-neighbor)の証言と2時間食い違う。管理人と@[別荘の持ち主](person:person-owner)の間に金銭の問題があった可能性を調べたい。',
      mentionedPersonIds: ['person-caretaker', 'person-neighbor', 'person-owner'],
      assessment: 'unverified',
    },
  ],
  relationships: [
    {
      id: 'relationship-employment',
      fromPersonId: 'person-owner',
      toPersonId: 'person-caretaker',
      label: '雇用主',
      directed: true,
      basisClaimIds: ['claim-caretaker'],
    },
    {
      id: 'relationship-money-trouble',
      fromPersonId: 'person-caretaker',
      toPersonId: 'person-owner',
      label: '金銭トラブル？',
      directed: false,
      basisClaimIds: ['claim-user-guess'],
    },
  ],
};
