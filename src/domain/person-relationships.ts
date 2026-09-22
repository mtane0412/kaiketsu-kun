/**
 * 人物どうしの関係（Relationship）を、人物の詳細に表示する形へ導出するロジック
 *
 * 関係は、証言から導いた結論としてユーザーが登録する一次データです（src/domain/types.ts の Relationship）。
 * 証言から毎回計算するビュー（case-views.ts）とは異なり、保存されたものをそのまま読み出します。
 * このファイルが担うのは、「開いている人物から見た形」への言い換えです。関係は from と to のどちらにも
 * その人物が入りうるため、相手の人物と、その人物から見た向き（双方向・自分から・自分へ）を求めます。
 *
 * 根拠の証言（Relationship.basisClaimIds）は、証言の詳細や逆引きと同じく、時系列ボードの並び順に並べます。
 * 一覧のどこで証言を見ても同じ順番になるようにするためです。
 *
 * 注意: 参照先の人物・証言が見つからない場合は、データ破損として例外を投げます（case-views.ts と同じ扱いです）。
 * 根拠の証言が見つからない場合に黙って読み飛ばすと、根拠を持つ関係が「根拠未登録」として表示され、
 * 裏付けの有無を読み違える原因になるため、早く失敗させます。
 * 参照の整合性は、ストアの操作と読み込み時の検証（case-schema.ts）で担保する前提です。
 */
import { buildTimeline, type ClaimView } from './case-views';
import type { Case, Id, Person, Relationship } from './types';

/**
 * 開いている人物から見た、関係の向きです。
 *
 * - mutual: 向きを持たない関係（Relationship.directed が false）です
 * - outgoing: 開いている人物から相手へ向く片方向の関係です
 * - incoming: 相手から開いている人物へ向く片方向の関係です
 */
export type PersonRelationshipDirection = 'mutual' | 'outgoing' | 'incoming';

/** 開いている人物から見た、1件の関係です。 */
export type PersonRelationshipView = {
  relationship: Relationship;
  /** 関係の相手の人物です。自分自身との関係の場合は、開いている人物そのものです。 */
  other: Person;
  direction: PersonRelationshipDirection;
  /** 根拠の証言です。時系列ボードの並び順に並びます。根拠が未登録の場合は空です。 */
  basisClaims: ClaimView[];
};

/** IDから人物を探します。見つからない場合は、データ破損として例外を投げます。 */
function personOf(target: Case, personId: Id): Person {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (!person) throw new Error(`人物が見つかりません: ${personId}`);
  return person;
}

/** 開いている人物から見た、関係の向きを求めます。 */
function directionOf(relationship: Relationship, personId: Id): PersonRelationshipDirection {
  if (!relationship.directed) return 'mutual';
  return relationship.fromPersonId === personId ? 'outgoing' : 'incoming';
}

/**
 * 指定した人物が関わる関係を、ケースへの登録順に返します。
 *
 * 関係の from と to のどちらに入っていても、その人物が関わる関係として返します。
 */
export function buildPersonRelationships(target: Case, personId: Id): PersonRelationshipView[] {
  const views = buildTimeline(target).items.map((item) => item.view);
  const claimIds = new Set(views.map((view) => view.claim.id));

  return target.relationships
    .filter(
      (relationship) => relationship.fromPersonId === personId || relationship.toPersonId === personId
    )
    .map((relationship) => {
      // 自分自身との関係でも相手を求められるよう、自分ではない側を相手とし、両側が自分なら自分を相手にする
      const otherId = relationship.fromPersonId === personId ? relationship.toPersonId : relationship.fromPersonId;
      for (const claimId of relationship.basisClaimIds) {
        if (!claimIds.has(claimId)) throw new Error(`証言が見つかりません: ${claimId}`);
      }

      return {
        relationship,
        other: personOf(target, otherId),
        direction: directionOf(relationship, personId),
        // 根拠は、証言の詳細や逆引きと同じ並びで読めるよう、登録した順ではなく時系列ボードの並び順にする
        basisClaims: views.filter((view) => relationship.basisClaimIds.includes(view.claim.id)),
      };
    });
}

/**
 * 関係を1行の文章で説明します。関係の名前と、どちらからどちらへ向く関係かを示します。
 * 例「雇用主（別荘の持ち主から管理人へ）」「金銭トラブル？（別荘の持ち主と管理人の双方向）」。
 *
 * @param view 開いている人物から見た関係
 * @param selfName 開いている人物の名前
 *
 * 注意: 矢印の記号ではなく言葉で書きます。関係の一覧は読み上げでもたどるため、向きが読み上げられるようにするためです。
 */
export function describePersonRelationship(view: PersonRelationshipView, selfName: string): string {
  const { label } = view.relationship;
  if (view.direction === 'mutual') return `${label}（${selfName}と${view.other.name}の双方向）`;

  const [fromName, toName] =
    view.direction === 'outgoing' ? [selfName, view.other.name] : [view.other.name, selfName];
  return `${label}（${fromName}から${toName}へ）`;
}

/**
 * 関係の根拠として選べる証言を、時系列ボードの並び順で返します。
 *
 * 候補は、指定した人物のいずれかが関わる証言（述べた・経由した・言及されている）に絞ります。
 * ケースの証言をすべて並べると、関係とは無縁の証言まで選択肢に並び、根拠を選びにくくなるためです。
 * すでに根拠として選ばれている証言は、絞り込みから外れても候補に残します。
 * 選択を外さない限り、編集の画面から根拠が消えないようにするためです。
 *
 * @param personIds 関係に関わる人物のIDです（編集中の人物と、選んだ相手）
 * @param selectedClaimIds すでに根拠として選ばれている証言のIDです
 */
export function buildBasisClaimCandidates(target: Case, personIds: Id[], selectedClaimIds: Id[]): ClaimView[] {
  const views = buildTimeline(target).items.map((item) => item.view);

  return views.filter((view) => {
    if (selectedClaimIds.includes(view.claim.id)) return true;
    const speakerIds = view.claim.speaker.kind === 'person' ? view.claim.speaker.personIds : [];
    const involvedIds = [...speakerIds, ...view.claim.viaPersonIds, ...view.claim.mentionedPersonIds];
    return personIds.some((personId) => involvedIds.includes(personId));
  });
}
