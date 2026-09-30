/**
 * 出来事（Event）を持っていた頃のデータの変換のテスト
 */
import { describe, expect, it } from 'vitest';
import { migrateLegacyEvents, type LegacyClaim } from './legacy-events';
import type { TimeRef } from './types';

/** ユーザーの推測としての、当時の証言を作ります。eventId を渡すと、その出来事に束ねた証言になります。 */
function makeContemporaryClaim(id: string, options: { when?: TimeRef; eventId?: string; content?: string } = {}): LegacyClaim {
  const claim: LegacyClaim = {
    id,
    speaker: { kind: 'user' },
    viaPersonIds: [],
    content: options.content ?? `${id}の内容`,
    mentionedPersonIds: [],
  };
  if (options.when) claim.when = options.when;
  if (options.eventId) claim.eventId = options.eventId;
  return claim;
}

const lastSighting = { id: 'event-last-seen', title: '持ち主が最後に目撃された' };
const august10: TimeRef = '1998-08-10';
const at7pm: TimeRef = '1998-08-12T19:00';
const at9pm: TimeRef = '1998-08-12T21:00';
const august15: TimeRef = '1998-08-15';

describe('migrateLegacyEvents', () => {
  it('並び順の中の出来事の束を、その位置に、束ねていた証言を当時の束の中の表示順（述べる日時の早い順）で並べて解く', () => {
    // 前提: 束の中は登録順ではなく、述べる日時の早い順（夜7時 → 夜9時 → 日時なし）で表示していた
    const converted = migrateLegacyEvents({
      events: [lastSighting],
      claims: [
        makeContemporaryClaim('claim-search', { when: august15 }),
        makeContemporaryClaim('claim-report', { eventId: 'event-last-seen' }),
        makeContemporaryClaim('claim-neighbor', { when: at9pm, eventId: 'event-last-seen' }),
        makeContemporaryClaim('claim-caretaker', { when: at7pm, eventId: 'event-last-seen' }),
        makeContemporaryClaim('claim-arrival', { when: august10 }),
      ],
      timelineOrder: ['claim:claim-arrival', 'event:event-last-seen', 'claim:claim-search'],
    });

    expect(converted.timelineOrder).toEqual([
      'claim:claim-arrival',
      'claim:claim-caretaker',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-search',
    ]);
  });

  it('証言から、束ねる出来事（eventId）を取り除く', () => {
    const converted = migrateLegacyEvents({
      events: [lastSighting],
      claims: [makeContemporaryClaim('claim-neighbor', { eventId: 'event-last-seen' })],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(converted.claims[0]).not.toHaveProperty('eventId');
  });

  it('本文の末尾の「@出来事」は、束ねる先を指定するための書き方だったため取り除く', () => {
    const converted = migrateLegacyEvents({
      events: [lastSighting],
      claims: [
        makeContemporaryClaim('claim-neighbor', {
          eventId: 'event-last-seen',
          content: '夜9時ごろ、庭に持ち主の姿が見えた。 @[持ち主が最後に目撃された](event:event-last-seen)',
        }),
      ],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(converted.claims[0]?.content).toBe('夜9時ごろ、庭に持ち主の姿が見えた。');
  });

  it('文中の「@出来事」は、出来事の現在のタイトルの文字に戻す', () => {
    // 前提: 本文のトークンが控えている表示名は古く、出来事はその後「持ち主が最後に目撃された」に改名されている
    const converted = migrateLegacyEvents({
      events: [lastSighting],
      claims: [
        makeContemporaryClaim('claim-user-guess', {
          eventId: 'event-last-seen',
          content: '@[最後の目撃](event:event-last-seen)の時刻は、証言によって2時間食い違う。',
        }),
      ],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(converted.claims[0]?.content).toBe('持ち主が最後に目撃されたの時刻は、証言によって2時間食い違う。');
  });

  it('本文が「@出来事」だけの証言は、本文が空にならないよう、タイトルの文字に戻す', () => {
    const converted = migrateLegacyEvents({
      events: [lastSighting],
      claims: [
        makeContemporaryClaim('claim-memo', { eventId: 'event-last-seen', content: '@[持ち主が最後に目撃された](event:event-last-seen)' }),
      ],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(converted.claims[0]?.content).toBe('持ち主が最後に目撃された');
  });

  it('並び順を持たない頃のデータは、当時の表示順（日時の早い順、日時を持たない項目は登録順）を補ってから束を解く', () => {
    const converted = migrateLegacyEvents({
      events: [lastSighting, { id: 'event-empty', title: '証言の無い出来事' }],
      claims: [
        makeContemporaryClaim('claim-memo'),
        makeContemporaryClaim('claim-search', { when: august15 }),
        makeContemporaryClaim('claim-caretaker', { when: at7pm, eventId: 'event-last-seen' }),
        makeContemporaryClaim('claim-arrival', { when: august10 }),
      ],
    });

    // 検証: 証言を1件も束ねていない出来事は、変換先が無いため並び順に残らない
    expect(converted.timelineOrder).toEqual([
      'claim:claim-arrival',
      'claim:claim-caretaker',
      'claim:claim-search',
      'claim:claim-memo',
    ]);
  });

  it('出来事を持たないデータは、内容を変えない', () => {
    const claims = [makeContemporaryClaim('claim-arrival', { when: august10 }), makeContemporaryClaim('claim-search', { when: august15 })];

    const converted = migrateLegacyEvents({ claims: claims, timelineOrder: ['claim:claim-search', 'claim:claim-arrival'] });

    expect(converted).toEqual({ claims: claims, timelineOrder: ['claim:claim-search', 'claim:claim-arrival'] });
  });
});
