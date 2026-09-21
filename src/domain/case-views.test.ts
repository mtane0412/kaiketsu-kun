/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildClaimDetail,
  buildMapTrail,
  buildPersonDetail,
  buildPlaceDetail,
  buildTimeline,
  findRelatedEntities,
  groupClaimsBySpeaker,
  groupStopsByPlace,
} from './case-views';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case } from './types';

describe('buildTimeline', () => {
  it('証言を、案件の並び順（timelineOrder）のとおりに並べる', () => {
    // 前提: ボード上の位置は日時ではなく並び順で決まる。並び順に載っていない証言（架空日報の記述・ユーザーの推測）は末尾に登録順で並ぶ
    const 案件: Case = {
      ...sampleFictionalCase,
      timelineOrder: ['claim:claim-neighbor', 'claim:claim-caretaker', 'claim:claim-police-camera'],
    };

    const items = buildTimeline(案件).items;

    expect(items.map((item) => item.view.claim.id)).toEqual([
      'claim-neighbor',
      'claim-caretaker',
      'claim-police-camera',
      'claim-report',
      'claim-user-guess',
    ]);
    expect(items[0]?.key).toBe('claim:claim-neighbor');
  });

  it('証言の参照先（発言者・経由・場所・言及している人物）を解決する', () => {
    const 防犯カメラの記録 = buildTimeline(sampleFictionalCase).items.find((item) => item.view.claim.id === 'claim-police-camera')?.view;
    const 隣家の証言 = buildTimeline(sampleFictionalCase).items.find((item) => item.view.claim.id === 'claim-neighbor')?.view;

    expect(防犯カメラの記録?.speakerLabel).toBe('県道の防犯カメラ');
    expect(防犯カメラの記録?.viaPersons.map((person) => person.name)).toEqual(['県警', '架空日報 朝刊']);
    expect(隣家の証言?.place?.name).toBe('湖畔の別荘');
    expect(隣家の証言?.mentionedPersons.map((person) => person.name)).toEqual(['別荘の持ち主']);
  });

  it('証言が存在しない場所を参照している場合はエラーにする', () => {
    const 壊れた案件: Case = {
      ...sampleFictionalCase,
      claims: [{ ...sampleFictionalCase.claims[0]!, placeId: 'place-missing' }],
    };

    expect(() => buildTimeline(壊れた案件)).toThrow('場所が見つかりません: place-missing');
  });
});

describe('groupClaimsBySpeaker', () => {
  it('人物（案件への登録順）、ユーザーの推測の順にグループを作る。新聞のような媒体も人物として並ぶ', () => {
    const groups = groupClaimsBySpeaker(sampleFictionalCase);

    expect(groups.map((group) => [group.kind, group.label])).toEqual([
      ['person', '隣家の住人'],
      ['person', '管理人'],
      ['person', '県道の防犯カメラ'],
      ['person', '架空日報 朝刊'],
      ['user', 'ユーザーの推測'],
    ]);
  });

  it('経由した人物は発言者ではないため、その人物のグループには入れない', () => {
    // 前提: サンプルでは、防犯カメラの記録を県警が発表し、架空日報が報じている（発言者: 防犯カメラ、経由: 県警 → 架空日報）
    const groups = groupClaimsBySpeaker(sampleFictionalCase);
    const 防犯カメラ = groups.find((group) => group.label === '県道の防犯カメラ');

    expect(防犯カメラ?.claims.map((item) => item.claim.id)).toEqual(['claim-police-camera']);
    expect(groups.find((group) => group.label === '県警')).toBeUndefined();
    // 地の文の記述だけが、架空日報のグループに入る
    expect(groups.find((group) => group.label === '架空日報 朝刊')?.claims.map((item) => item.claim.id)).toEqual([
      'claim-report',
    ]);
  });

  it('同じ発言者の証言を、述べられた時点の早い順に並べる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-caretaker-early',
          speaker: { kind: 'person', personIds: ['person-caretaker'] },
          viaPersonIds: ['person-newspaper'],
          content: '持ち主とは挨拶をする程度の付き合いだった。',
          statedAt: { text: '1998年8月14日', earliest: '1998-08-14' },
          mentionedPersonIds: ['person-owner'],
        },
      ],
    };

    const 管理人 = groupClaimsBySpeaker(案件).find((group) => group.label === '管理人');

    expect(管理人?.claims.map((item) => item.claim.id)).toEqual(['claim-caretaker-early', 'claim-caretaker']);
  });

  it('複数の人物が述べた証言は、それぞれの人物のグループに入れ、発言者名を全員分つなげて示す', () => {
    // 前提: 1つの記事が、隣家の住人と管理人の2人が同じことを述べたと伝えている
    const 案件: Case = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-two-speakers',
          speaker: { kind: 'person', personIds: ['person-neighbor', 'person-caretaker'] },
          viaPersonIds: ['person-newspaper'],
          content: '持ち主は几帳面な人だった。',
          mentionedPersonIds: ['person-owner'],
        },
      ],
    };

    const groups = groupClaimsBySpeaker(案件);
    const 隣家の住人 = groups.find((group) => group.label === '隣家の住人');
    const 管理人 = groups.find((group) => group.label === '管理人');

    expect(隣家の住人?.claims.map((item) => item.claim.id)).toContain('claim-two-speakers');
    expect(管理人?.claims.map((item) => item.claim.id)).toContain('claim-two-speakers');
    expect(管理人?.claims.find((item) => item.claim.id === 'claim-two-speakers')?.speakerLabel).toBe('隣家の住人、管理人');
  });

  it('証言に、経由した人物を伝えた順に添える', () => {
    const 防犯カメラ = groupClaimsBySpeaker(sampleFictionalCase).find((group) => group.label === '県道の防犯カメラ');

    expect(防犯カメラ?.claims[0]?.viaPersons.map((person) => person.name)).toEqual(['県警', '架空日報 朝刊']);
  });
});

describe('人物の画像', () => {
  const 住人の画像 = 'data:image/jpeg;base64,AAAA';
  const 案件: Case = {
    ...sampleFictionalCase,
    persons: sampleFictionalCase.persons.map((person) =>
      person.id === 'person-neighbor' ? { ...person, imageDataUrl: 住人の画像 } : person
    ),
  };

  it('証言のビューに、発言者の人物を載せる（カードに発言者の画像を表示するため）', () => {
    const 住人の証言 = buildTimeline(案件).items.find((item) => item.view.claim.id === 'claim-neighbor')?.view;
    const 推測 = buildTimeline(案件).items.find((item) => item.view.claim.id === 'claim-user-guess')?.view;

    expect(住人の証言?.speakerPersons.map((person) => person.imageDataUrl)).toEqual([住人の画像]);
    expect(推測?.speakerPersons).toEqual([]);
  });

  it('証言者別ビューのグループに、その人物の画像を載せる', () => {
    const groups = groupClaimsBySpeaker(案件);

    expect(groups.find((group) => group.key === 'person:person-neighbor')?.imageDataUrl).toBe(住人の画像);
    expect(groups.find((group) => group.key === 'user')?.imageDataUrl).toBeUndefined();
  });

  it('証言者別ビューのグループに、その人物のアイコンの文字を載せる（ユーザーの推測には載せない）', () => {
    const groups = groupClaimsBySpeaker(案件);

    expect(groups.find((group) => group.key === 'person:person-neighbor')?.iconText).toBe('隣');
    expect(groups.find((group) => group.key === 'user')?.iconText).toBeUndefined();
  });
});

describe('findRelatedEntities', () => {
  /** 持ち主のメモが管理人と別荘に触れ、隣家の住人のメモが持ち主に触れている案件です。 */
  const メモで関連付けた案件: Case = {
    ...sampleFictionalCase,
    persons: sampleFictionalCase.persons.map((person) => {
      if (person.id === 'person-owner') {
        return {
          ...person,
          note: '@[管理人](person:person-caretaker)を雇い、@[湖畔の別荘](place:place-villa)の手入れを任せていた。',
        };
      }
      if (person.id === 'person-neighbor') {
        return { ...person, note: '@[別荘の持ち主](person:person-owner)とは20年来の付き合い。' };
      }
      return person;
    }),
  };

  it('メモで言及しているエンティティと、メモで言及されているエンティティを、人物・場所の登録順に返す', () => {
    const related = findRelatedEntities(メモで関連付けた案件, 'person', 'person-owner');

    expect(related).toEqual([
      { kind: 'person', id: 'person-neighbor', name: '隣家の住人', iconText: '隣', mentions: false, mentionedBy: true },
      { kind: 'person', id: 'person-caretaker', name: '管理人', iconText: '管', mentions: true, mentionedBy: false },
      { kind: 'place', id: 'place-villa', name: '湖畔の別荘', mentions: true, mentionedBy: false },
    ]);
  });

  it('メモを持たないエンティティも、他のエンティティのメモで言及されていれば関連として返す', () => {
    // 前提: 別荘（場所）にはメモが無いが、持ち主のメモが別荘に触れている
    const related = findRelatedEntities(メモで関連付けた案件, 'place', 'place-villa');

    expect(related).toEqual([
      { kind: 'person', id: 'person-owner', name: '別荘の持ち主', iconText: '別', mentions: false, mentionedBy: true },
    ]);
  });

  it('互いのメモで言及し合っているエンティティは、1件にまとめる', () => {
    const 案件: Case = {
      ...メモで関連付けた案件,
      persons: メモで関連付けた案件.persons.map((person) =>
        person.id === 'person-caretaker' ? { ...person, note: '@[別荘の持ち主](person:person-owner)に雇われていた。' } : person
      ),
    };

    const 管理人との関連 = findRelatedEntities(案件, 'person', 'person-owner').find((item) => item.id === 'person-caretaker');

    expect(管理人との関連).toMatchObject({ mentions: true, mentionedBy: true });
  });

  it('画像が登録されているエンティティには、画像を載せる', () => {
    const 画像 = 'data:image/png;base64,AAAA';
    const 案件: Case = { ...メモで関連付けた案件, places: [{ id: 'place-villa', name: '湖畔の別荘', imageDataUrl: 画像 }] };

    const 別荘との関連 = findRelatedEntities(案件, 'person', 'person-owner').find((item) => item.id === 'place-villa');

    expect(別荘との関連?.imageDataUrl).toBe(画像);
  });

  it('関連する人物にはアイコンの文字を載せ、関連する場所には載せない', () => {
    const 関連 = findRelatedEntities(メモで関連付けた案件, 'person', 'person-owner');

    expect(関連.find((item) => item.id === 'person-caretaker')?.iconText).toBe('管');
    expect(関連.find((item) => item.id === 'place-villa')?.iconText).toBeUndefined();
  });

  it('自分自身へのメンションは、関連に含めない', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-owner' ? { ...person, note: '@[別荘の持ち主](person:person-owner)は本人である。' } : person
      ),
    };

    expect(findRelatedEntities(案件, 'person', 'person-owner')).toEqual([]);
  });

  it('どのメモにも現れないエンティティは、関連が無い', () => {
    expect(findRelatedEntities(メモで関連付けた案件, 'person', 'person-police')).toEqual([]);
  });
});

describe('buildMapTrail', () => {
  /** 湖畔の別荘に座標を登録し、座標の無い場所（県道の交差点）で述べられた証言を加えた案件です。 */
  const 座標を登録した案件: Case = {
    ...sampleFictionalCase,
    places: [
      { id: 'place-villa', name: '湖畔の別荘', latitude: 35.5, longitude: 138.75 },
      { id: 'place-crossing', name: '県道の交差点' },
    ],
    claims: sampleFictionalCase.claims.map((claim) =>
      claim.id === 'claim-police-camera' ? { ...claim, placeId: 'place-crossing' } : claim
    ),
  };

  it('座標のある場所で述べられた証言を、時系列の並び順のとおりに、1から始まる番号を付けて並べる', () => {
    // 前提: 並び順は 管理人 → 防犯カメラ → 隣家 → 架空日報 → 推測。このうち座標のある場所を述べるのは管理人と隣家の証言だけ
    const trail = buildMapTrail(座標を登録した案件);

    expect(trail.stops.map((stop) => [stop.order, stop.view.claim.id])).toEqual([
      [1, 'claim-caretaker'],
      [2, 'claim-neighbor'],
    ]);
    expect(trail.stops[0]?.place.name).toBe('湖畔の別荘');
    expect(trail.stops[0]?.coordinates).toEqual({ latitude: 35.5, longitude: 138.75 });
  });

  it('地図に表示できない証言を、理由（場所が無い・場所に座標が無い）と共に、時系列の並び順のとおりに返す', () => {
    const trail = buildMapTrail(座標を登録した案件);

    expect(trail.unmapped.map((item) => [item.view.claim.id, item.reason])).toEqual([
      ['claim-police-camera', 'no-coordinates'],
      ['claim-report', 'no-place'],
      ['claim-user-guess', 'no-place'],
    ]);
  });

  it('緯度と経度の片方しか無い場所は、座標が無い場所として扱う', () => {
    const 緯度だけの案件: Case = { ...sampleFictionalCase, places: [{ id: 'place-villa', name: '湖畔の別荘', latitude: 35.5 }] };

    const trail = buildMapTrail(緯度だけの案件);

    expect(trail.stops).toEqual([]);
    expect(trail.unmapped.filter((item) => item.reason === 'no-coordinates').map((item) => item.view.claim.id)).toEqual([
      'claim-caretaker',
      'claim-neighbor',
    ]);
  });
});

describe('groupStopsByPlace', () => {
  it('同じ場所の証言を1つのピンにまとめ、ピンを最初に登場する順に並べる', () => {
    const 案件: Case = {
      ...sampleFictionalCase,
      places: [
        { id: 'place-villa', name: '湖畔の別荘', latitude: 35.5, longitude: 138.75 },
        { id: 'place-crossing', name: '県道の交差点', latitude: 35.51, longitude: 138.76 },
      ],
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-police-camera' ? { ...claim, placeId: 'place-crossing' } : claim
      ),
    };

    const pins = groupStopsByPlace(buildMapTrail(案件).stops);

    // 並び順は 管理人（別荘）→ 防犯カメラ（交差点）→ 隣家（別荘）
    expect(pins.map((pin) => [pin.place.name, pin.orders])).toEqual([
      ['湖畔の別荘', [1, 3]],
      ['県道の交差点', [2]],
    ]);
    expect(pins[1]?.coordinates).toEqual({ latitude: 35.51, longitude: 138.76 });
  });
});

describe('buildClaimDetail', () => {
  // 前提: サンプルの案件の時系列は「管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測」の順に並ぶ

  it('証言の参照先を解決し、時系列の並び順での前後の証言を返す', () => {
    const detail = buildClaimDetail(sampleFictionalCase, 'claim-neighbor');

    expect(detail?.view.speakerLabel).toBe('隣家の住人');
    expect(detail?.previous?.claim.id).toBe('claim-police-camera');
    expect(detail?.next?.claim.id).toBe('claim-report');
  });

  it('時系列の先頭の証言には前の証言が無く、末尾の証言には次の証言が無い', () => {
    expect(buildClaimDetail(sampleFictionalCase, 'claim-caretaker')?.previous).toBeUndefined();
    expect(buildClaimDetail(sampleFictionalCase, 'claim-user-guess')?.next).toBeUndefined();
  });

  it('この証言が触れている人物・場所ごとに、同じ人物・場所に触れている他の証言を、時系列の並び順でまとめる', () => {
    // 前提: 隣家の住人の証言は、発言者が隣家の住人で、架空日報 朝刊を経由し、本文で別荘の持ち主と湖畔の別荘に触れている
    const detail = buildClaimDetail(sampleFictionalCase, 'claim-neighbor');

    // 検証: 発言者・経由した人物・言及している人物・場所の順に並び、この証言自身は含めない
    expect(detail?.relatedClaimGroups.map((group) => [group.kind, group.label, group.claims.map((view) => view.claim.id)])).toEqual([
      ['person', '隣家の住人', ['claim-user-guess']],
      ['person', '架空日報 朝刊', ['claim-police-camera', 'claim-report']],
      ['person', '別荘の持ち主', ['claim-caretaker', 'claim-police-camera', 'claim-report', 'claim-user-guess']],
      ['place', '湖畔の別荘', ['claim-caretaker']],
    ]);
  });

  it('経由した人物に触れている他の証言もまとめ、他の証言が無い人物・場所のグループは作らない', () => {
    // 前提: 防犯カメラの記録は「県警 → 架空日報 朝刊」を経由している。架空日報 朝刊は別の証言の発言者でもあるが、県警に触れる証言は他に無い
    const detail = buildClaimDetail(sampleFictionalCase, 'claim-police-camera');

    const labels = detail?.relatedClaimGroups.map((group) => group.label);
    expect(labels).toContain('架空日報 朝刊');
    expect(labels).not.toContain('県警');
    expect(labels).not.toContain('県道の防犯カメラ');
  });

  it('案件に無い証言のIDを渡すと undefined を返す（URLの直接入力で、削除済みの証言を開いた場合）', () => {
    expect(buildClaimDetail(sampleFictionalCase, 'claim-deleted')).toBeUndefined();
  });
});

describe('buildPersonDetail', () => {
  // 前提: サンプルの案件の時系列は「管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測」の順に並ぶ

  it('人物から証言を逆引きし、発言者・経由・言及のまとまりを、時系列の並び順で返す', () => {
    // 前提: 架空日報 朝刊は、連絡が取れない件を自ら述べ、隣家の住人と防犯カメラの証言を伝えている
    const detail = buildPersonDetail(sampleFictionalCase, 'person-newspaper');

    expect(detail?.person.name).toBe('架空日報 朝刊');
    expect(detail?.claimGroups.map((group) => [group.label, group.claims.map((view) => view.claim.id)])).toEqual([
      ['この人物が述べた証言', ['claim-report']],
      ['この人物を経由して伝わった証言', ['claim-police-camera', 'claim-neighbor']],
    ]);
  });

  it('言及されている証言も逆引きし、1件も無いまとまりは作らない', () => {
    // 前提: 別荘の持ち主は、自ら述べた証言も経由した証言も無く、5件すべての証言に言及されている
    const detail = buildPersonDetail(sampleFictionalCase, 'person-owner');

    expect(detail?.claimGroups.map((group) => [group.label, group.claims.map((view) => view.claim.id)])).toEqual([
      [
        'この人物に言及している証言',
        ['claim-caretaker', 'claim-police-camera', 'claim-neighbor', 'claim-report', 'claim-user-guess'],
      ],
    ]);
  });

  it('メモのメンションでつながった、関連するエンティティを返す', () => {
    // 前提: 隣家の住人のメモから、湖畔の別荘に言及している案件を用意する
    const 案件: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor'
          ? { ...person, note: '@[湖畔の別荘](place:place-villa)の隣に住んでいます。' }
          : person
      ),
    };
    const detail = buildPersonDetail(案件, 'person-neighbor');

    expect(detail?.relatedEntities.map((related) => related.name)).toEqual(['湖畔の別荘']);
  });

  it('案件に無い人物のIDを渡すと undefined を返す（URLの直接入力で、削除済みの人物を開いた場合）', () => {
    expect(buildPersonDetail(sampleFictionalCase, 'person-deleted')).toBeUndefined();
  });
});

describe('buildPlaceDetail', () => {
  it('場所から証言を逆引きし、その場所を述べている証言を、時系列の並び順で返す', () => {
    // 前提: 湖畔の別荘を述べているのは、管理人の証言と隣家の住人の証言の2件
    const detail = buildPlaceDetail(sampleFictionalCase, 'place-villa');

    expect(detail?.place.name).toBe('湖畔の別荘');
    expect(detail?.claimGroups.map((group) => [group.label, group.claims.map((view) => view.claim.id)])).toEqual([
      ['この場所を述べている証言', ['claim-caretaker', 'claim-neighbor']],
    ]);
  });

  it('その場所を述べている証言が1件も無い場合は、まとまりを作らない', () => {
    // 前提: どの証言も述べていない「県道の交差点」を登録する
    const 案件: Case = {
      ...sampleFictionalCase,
      places: [...sampleFictionalCase.places, { id: 'place-crossing', name: '県道の交差点' }],
    };

    expect(buildPlaceDetail(案件, 'place-crossing')?.claimGroups).toEqual([]);
  });

  it('案件に無い場所のIDを渡すと undefined を返す（URLの直接入力で、削除済みの場所を開いた場合）', () => {
    expect(buildPlaceDetail(sampleFictionalCase, 'place-deleted')).toBeUndefined();
  });
});
