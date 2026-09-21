/**
 * 型定義の書き心地を確かめるための架空の案件サンプル
 *
 * このファイルの人物・場所・資料はすべて架空です。
 * 次の5点が型で表現できることを確認する目的で作成しています。
 * - 同じ事柄について、2人の証言が述べる時刻が食い違うこと（食い違いは判定せず、時系列に並べて読み手が見比べます）
 * - 証言が述べる内容の時点と、証言が述べられた時点が別の時間軸であること
 * - 報道の地の文を、媒体（新聞）の発言として扱えること
 * - ユーザーの推測を人物の発言と区別し、関係の根拠として参照できること
 * - 組織（県警）・記録装置（防犯カメラ）・媒体（新聞、書籍）を、人物と同じく発言しうる主体として扱えること
 * - 伝聞の経路（防犯カメラの記録を、県警が発表し、新聞が報じた）を、経由（viaPersonIds）で表せること
 *
 * 証言の本文（content）は、人物・場所への参照を `@[表示名](種類:ID)` の形式で含みます。
 * 各証言の placeId・mentionedPersonIds は、本文からの導出結果（src/domain/mention.ts）と一致させています。
 */
import type { Case } from './types';

export const sampleFictionalCase: Case = {
  id: 'case-lakeside',
  name: '湖畔の別荘失踪事件（架空）',
  persons: [
    { id: 'person-owner', name: '別荘の持ち主' },
    { id: 'person-neighbor', name: '隣家の住人' },
    { id: 'person-caretaker', name: '管理人', aliases: ['元管理人'] },
    { id: 'person-police', name: '県警', note: '組織です。' },
    { id: 'person-road-camera', name: '県道の防犯カメラ', note: '記録装置です。別荘へ向かう道路に設置されています。' },
    { id: 'person-newspaper', name: '架空日報 朝刊', note: '媒体です。1998年8月14日の記事を参照しています。' },
    { id: 'person-book', name: '湖畔の夏 20年目の証言（架空の書籍）', note: '媒体です。2018年に刊行されました。' },
  ],
  places: [{ id: 'place-villa', name: '湖畔の別荘' }],
  claims: [
    {
      id: 'claim-report',
      speaker: { kind: 'person', personIds: ['person-newspaper'] },
      viaPersonIds: [],
      locator: '社会面',
      content: '@[別荘の持ち主](person:person-owner)は12日夜から連絡が取れなくなっている。',
      statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
      mentionedPersonIds: ['person-owner'],
    },
    {
      id: 'claim-neighbor',
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['person-newspaper'],
      locator: '社会面',
      content: 
        '夜9時ごろ、@[湖畔の別荘](place:place-villa)の明かりがついていて、庭に@[別荘の持ち主](person:person-owner)の姿が見えた。',
      statedAt: { text: '1998年8月13日', earliest: '1998-08-13' },
      mentionedPersonIds: ['person-owner'],
      when: { text: '8月12日 夜9時ごろ', earliest: '1998-08-12T20:30', latest: '1998-08-12T21:30' },
      placeId: 'place-villa',
    },
    {
      id: 'claim-caretaker',
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      viaPersonIds: ['person-book'],
      locator: '第3章 112ページ',
      content: 
        '夜7時に見回りをしたとき、@[湖畔の別荘](place:place-villa)はすでに真っ暗で、@[別荘の持ち主](person:person-owner)の車も無かった。',
      statedAt: { text: '2018年', earliest: '2018-01-01', latest: '2018-12-31' },
      mentionedPersonIds: ['person-owner'],
      when: { text: '8月12日 夜7時', earliest: '1998-08-12T19:00' },
      placeId: 'place-villa',
    },
    {
      id: 'claim-police-camera',
      speaker: { kind: 'person', personIds: ['person-road-camera'] },
      viaPersonIds: ['person-police', 'person-newspaper'],
      locator: '社会面',
      content:
        '夜8時10分ごろ、@[別荘の持ち主](person:person-owner)の車が別荘の方向へ走る様子が映っていた。',
      statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
      mentionedPersonIds: ['person-owner'],
      when: { text: '8月12日 夜8時10分ごろ', earliest: '1998-08-12T20:00', latest: '1998-08-12T20:20' },
    },
    {
      id: 'claim-user-guess',
      speaker: { kind: 'user' },
      viaPersonIds: [],
      content: 
        '@[管理人](person:person-caretaker)の証言は事件の20年後に初めて出たもので、@[隣家の住人](person:person-neighbor)の証言と2時間食い違う。管理人と@[別荘の持ち主](person:person-owner)の間に金銭の問題があった可能性を調べたい。',
      mentionedPersonIds: ['person-caretaker', 'person-neighbor', 'person-owner'],
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
  timelineOrder: [
    'claim:claim-caretaker',
    'claim:claim-police-camera',
    'claim:claim-neighbor',
    'claim:claim-report',
    'claim:claim-user-guess',
  ],
};
