/**
 * 出来事（Event）を持っていた頃のデータの変換のテスト
 */
import { describe, expect, it } from 'vitest';
import { migrateLegacyEvents, type LegacyClaim } from './legacy-events';
import type { TimeRef } from './types';

/** ユーザーの推測としての、当時の証言を作ります。eventId を渡すと、その出来事に束ねた証言になります。 */
function 当時の証言(id: string, options: { when?: TimeRef; eventId?: string; content?: string } = {}): LegacyClaim {
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

const 最後の目撃 = { id: 'event-last-seen', title: '持ち主が最後に目撃された' };
const 八月十日: TimeRef = '1998-08-10';
const 夜7時: TimeRef = '1998-08-12T19:00';
const 夜9時: TimeRef = '1998-08-12T21:00';
const 八月十五日: TimeRef = '1998-08-15';

describe('migrateLegacyEvents', () => {
  it('並び順の中の出来事の束を、その位置に、束ねていた証言を当時の束の中の表示順（述べる日時の早い順）で並べて解く', () => {
    // 前提: 束の中は登録順ではなく、述べる日時の早い順（夜7時 → 夜9時 → 日時なし）で表示していた
    const 変換後 = migrateLegacyEvents({
      events: [最後の目撃],
      claims: [
        当時の証言('claim-search', { when: 八月十五日 }),
        当時の証言('claim-report', { eventId: 'event-last-seen' }),
        当時の証言('claim-neighbor', { when: 夜9時, eventId: 'event-last-seen' }),
        当時の証言('claim-caretaker', { when: 夜7時, eventId: 'event-last-seen' }),
        当時の証言('claim-arrival', { when: 八月十日 }),
      ],
      timelineOrder: ['claim:claim-arrival', 'event:event-last-seen', 'claim:claim-search'],
    });

    expect(変換後.timelineOrder).toEqual([
      'claim:claim-arrival',
      'claim:claim-caretaker',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-search',
    ]);
  });

  it('証言から、束ねる出来事（eventId）を取り除く', () => {
    const 変換後 = migrateLegacyEvents({
      events: [最後の目撃],
      claims: [当時の証言('claim-neighbor', { eventId: 'event-last-seen' })],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(変換後.claims[0]).not.toHaveProperty('eventId');
  });

  it('本文の末尾の「@出来事」は、束ねる先を指定するための書き方だったため取り除く', () => {
    const 変換後 = migrateLegacyEvents({
      events: [最後の目撃],
      claims: [
        当時の証言('claim-neighbor', {
          eventId: 'event-last-seen',
          content: '夜9時ごろ、庭に持ち主の姿が見えた。 @[持ち主が最後に目撃された](event:event-last-seen)',
        }),
      ],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(変換後.claims[0]?.content).toBe('夜9時ごろ、庭に持ち主の姿が見えた。');
  });

  it('文中の「@出来事」は、出来事の現在のタイトルの文字に戻す', () => {
    // 前提: 本文のトークンが控えている表示名は古く、出来事はその後「持ち主が最後に目撃された」に改名されている
    const 変換後 = migrateLegacyEvents({
      events: [最後の目撃],
      claims: [
        当時の証言('claim-user-guess', {
          eventId: 'event-last-seen',
          content: '@[最後の目撃](event:event-last-seen)の時刻は、証言によって2時間食い違う。',
        }),
      ],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(変換後.claims[0]?.content).toBe('持ち主が最後に目撃されたの時刻は、証言によって2時間食い違う。');
  });

  it('本文が「@出来事」だけの証言は、本文が空にならないよう、タイトルの文字に戻す', () => {
    const 変換後 = migrateLegacyEvents({
      events: [最後の目撃],
      claims: [
        当時の証言('claim-memo', { eventId: 'event-last-seen', content: '@[持ち主が最後に目撃された](event:event-last-seen)' }),
      ],
      timelineOrder: ['event:event-last-seen'],
    });

    expect(変換後.claims[0]?.content).toBe('持ち主が最後に目撃された');
  });

  it('並び順を持たない頃のデータは、当時の表示順（日時の早い順、日時を持たない項目は登録順）を補ってから束を解く', () => {
    const 変換後 = migrateLegacyEvents({
      events: [最後の目撃, { id: 'event-empty', title: '証言の無い出来事' }],
      claims: [
        当時の証言('claim-memo'),
        当時の証言('claim-search', { when: 八月十五日 }),
        当時の証言('claim-caretaker', { when: 夜7時, eventId: 'event-last-seen' }),
        当時の証言('claim-arrival', { when: 八月十日 }),
      ],
    });

    // 検証: 証言を1件も束ねていない出来事は、変換先が無いため並び順に残らない
    expect(変換後.timelineOrder).toEqual([
      'claim:claim-arrival',
      'claim:claim-caretaker',
      'claim:claim-search',
      'claim:claim-memo',
    ]);
  });

  it('出来事を持たないデータは、内容を変えない', () => {
    const 証言一覧 = [当時の証言('claim-arrival', { when: 八月十日 }), 当時の証言('claim-search', { when: 八月十五日 })];

    const 変換後 = migrateLegacyEvents({ claims: 証言一覧, timelineOrder: ['claim:claim-search', 'claim:claim-arrival'] });

    expect(変換後).toEqual({ claims: 証言一覧, timelineOrder: ['claim:claim-search', 'claim:claim-arrival'] });
  });
});
