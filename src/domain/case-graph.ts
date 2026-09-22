/**
 * ケースデータからグラフビューのノードとエッジを導出するロジック
 *
 * グラフは、人物と証言の両方をノードに置く二部グラフです（証言同士・人物同士を直接つなぐことは、伝聞の経路を除いてしません）。
 * 「誰が・誰を経由して・誰について述べたか」というこのアプリのモデルを、そのまま図にすることを狙っています。
 * エッジは次の4種類です。前の3種類は証言（Claim）から導出し、関係（relates）だけは人物どうしの関係（Relationship）から作ります。
 *
 * - 発言（speaks）: 発言者の人物 → 証言。ユーザーの推測は、ユーザーのノード（USER_GRAPH_NODE_ID）から張ります
 * - 経由（via）: 証言 → 最初に伝えた人物 → 次に伝えた人物…（Claim.viaPersonIds の順）。伝聞が伝わってきた向きに張ります
 * - 言及（mentions）: 証言 → その証言が言及している人物
 * - 関係（relates）: 人物 → 人物（Relationship.fromPersonId → toPersonId）。ユーザーが証言から導いた結論です
 *
 * 関係のエッジだけは証言を経由しないため、他の3種類とは性質が違います。読み手がその違いを図の上で見分けられるよう、
 * 向きの有無（Relationship.directed）と根拠の有無（Relationship.basisClaimIds）をエッジに載せ、描画側（GraphView）が
 * 線の形を変えられるようにします。関係の名前（Relationship.label）も載せます。線の形だけでは何の関係かが分からないため、
 * 描画側が線ごとの名前として使います。関係のエッジは、証言から導いたエッジをすべて並べた後ろに置きます。
 *
 * 証言に1度も登場しない人物も、孤立したノードとして残します。登録しただけの人物が図から消えると、
 * 登録済みかどうかがグラフだけでは分からなくなるためです。
 * ノードの並びは、人物（ケースへの登録順）→ ユーザー → 証言（時系列ボードの並び順）の順です。
 * 並びを決めておくのは、レイアウト（src/lib/graph-layout.ts）の結果を、同じケースなら毎回同じにするためです。
 * このビューも他のビューと同じく一次データから毎回計算する派生物であり、保存しません。
 */
import { buildTimeline, claimLabelOf, USER_SPEAKER_LABEL } from './case-views';
import { personIconText } from './person-icon';
import type { Case, Id } from './types';

/** グラフのノードの種類です。人物・証言に加えて、発言者を選ばない証言（ユーザーの推測）をまとめるノードを持ちます。 */
export type GraphNodeKind = 'person' | 'claim' | 'user';

/** グラフのエッジの種類です。 */
export type GraphEdgeKind = 'speaks' | 'via' | 'mentions' | 'relates';

/** 関係のエッジ（relates）だけが持つ、線の描き分けに使う情報です。 */
export type GraphEdgeRelation = {
  /** true の場合は from から to への片方向、false の場合は双方向の関係です。 */
  directed: boolean;
  /** 根拠の証言が1件以上登録されているかどうかです。 */
  hasBasis: boolean;
};

/** グラフの1つのノードです。 */
export type GraphNode = {
  /** グラフの中でノードを一意に識別するキーです（'person:人物のID' / 'claim:証言のID' / 'user'）。 */
  id: string;
  kind: GraphNodeKind;
  /** ノードに表示する名前です。人物は人物の名前、証言は証言の名前（claimLabelOf）です。 */
  label: string;
  /** 元になった人物・証言のIDです。ノードを押したときに開く詳細ページに使います。ユーザーのノードには載りません。 */
  entityId?: Id;
  /** 人物に登録された画像です。 */
  imageDataUrl?: string;
  /** 画像が無い場合にアイコンへ表示する1文字です。人物にだけ載ります。 */
  iconText?: string;
};

/** グラフの1本のエッジです。 */
export type GraphEdge = {
  /** グラフの中でエッジを一意に識別するキーです。 */
  id: string;
  kind: GraphEdgeKind;
  /** 始点のノードのID（GraphNode.id）です。 */
  sourceId: string;
  /** 終点のノードのID（GraphNode.id）です。 */
  targetId: string;
  /** 関係のエッジ（relates）だけが持つ、関係の名前（Relationship.label）です。 */
  label?: string;
  /** 関係のエッジ（relates）だけが持つ、向きの有無と根拠の有無です。 */
  relation?: GraphEdgeRelation;
};

/** グラフビュー全体です。 */
export type CaseGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/** ユーザーの推測をまとめるノードのIDです。人物のIDと衝突しないよう、接頭辞を持たない専用のキーにします。 */
export const USER_GRAPH_NODE_ID = 'user';

/** 人物のノードのIDを組み立てます。 */
export function personNodeId(personId: Id): string {
  return `person:${personId}`;
}

/** 証言のノードのIDを組み立てます。 */
export function claimNodeId(claimId: Id): string {
  return `claim:${claimId}`;
}

/**
 * エッジを組み立てます。IDは、種類・元になった証言・両端のノードの組み合わせから決めます。
 *
 * IDに元になった証言を含めるのは、伝聞の経路（via）のエッジが人物と人物をつなぐためです。
 * 複数の証言が同じ経路（例えば「県警 → 架空日報」）を通ると、証言を含めないIDはぶつかります。
 */
function edgeOf(kind: GraphEdgeKind, claimNodeIdOfEdge: string, sourceId: string, targetId: string): GraphEdge {
  return { id: `${kind}:${claimNodeIdOfEdge}:${sourceId}->${targetId}`, kind, sourceId, targetId };
}

/**
 * 人物どうしの関係を、人物から人物へのエッジにします。
 *
 * エッジのIDには関係のIDを使います。同じ2人の間に複数の関係（例えば「雇用主」と「金銭トラブル？」）を登録できるため、
 * 両端のノードだけからIDを決めると、エッジがぶつかるためです。
 */
function relationshipEdgesOf(target: Case): GraphEdge[] {
  return target.relationships.map((relationship) => ({
    id: `relates:${relationship.id}`,
    kind: 'relates',
    sourceId: personNodeId(relationship.fromPersonId),
    targetId: personNodeId(relationship.toPersonId),
    label: relationship.label,
    relation: { directed: relationship.directed, hasBasis: relationship.basisClaimIds.length > 0 },
  }));
}

/**
 * グラフビューを組み立てます。
 *
 * 注意: 参照先の人物が見つからない場合は buildTimeline が例外を投げます（データ破損として扱います）。
 */
export function buildCaseGraph(target: Case): CaseGraph {
  const views = buildTimeline(target).items.map((item) => item.view);

  const personNodes: GraphNode[] = target.persons.map((person) => {
    const node: GraphNode = {
      id: personNodeId(person.id),
      kind: 'person',
      label: person.name,
      entityId: person.id,
      iconText: personIconText(person),
    };
    if (person.imageDataUrl !== undefined) node.imageDataUrl = person.imageDataUrl;
    return node;
  });

  const hasUserClaim = views.some((view) => view.claim.speaker.kind === 'user');
  const userNodes: GraphNode[] = hasUserClaim
    ? [{ id: USER_GRAPH_NODE_ID, kind: 'user', label: USER_SPEAKER_LABEL }]
    : [];

  const claimNodes: GraphNode[] = views.map((view) => ({
    id: claimNodeId(view.claim.id),
    kind: 'claim',
    label: claimLabelOf(view),
    entityId: view.claim.id,
  }));

  const edges = views.flatMap((view): GraphEdge[] => {
    const claimId = claimNodeId(view.claim.id);
    const speakerIds =
      view.claim.speaker.kind === 'person'
        ? view.claim.speaker.personIds.map(personNodeId)
        : [USER_GRAPH_NODE_ID];

    // 伝聞の経路は、証言を起点に、伝えた順の人物を数珠つなぎにする
    const viaNodeIds = view.claim.viaPersonIds.map(personNodeId);
    const viaEdges = viaNodeIds.map((nodeId, index) => edgeOf('via', claimId, viaNodeIds[index - 1] ?? claimId, nodeId));

    return [
      ...speakerIds.map((speakerId) => edgeOf('speaks', claimId, speakerId, claimId)),
      ...viaEdges,
      ...view.claim.mentionedPersonIds.map((personId) => edgeOf('mentions', claimId, claimId, personNodeId(personId))),
    ];
  });

  return {
    nodes: [...personNodes, ...userNodes, ...claimNodes],
    edges: [...edges, ...relationshipEdgesOf(target)],
  };
}
