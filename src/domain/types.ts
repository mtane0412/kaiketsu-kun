/**
 * ドメインモデルの型定義（検証用ドラフト）
 *
 * このファイルは、調査ボードが扱う一次データの形を定義します。
 * 設計の中心は「証言（Claim）」です。人物相関図・時系列・証言者別・地図の各ビューは、
 * すべて証言の集合から導出される表示であり、一次データではありません。
 *
 * 用語:
 * - ケース（Case）: 1つの事件、または1つの作品。すべてのデータの入れ物
 * - 人物（Person）: 発言しうる主体の全般。個人・組織・記録装置・新聞や書籍などの媒体・物を含み、種別（kind）で区別する
 * - 証言（Claim）: 「誰が・誰を経由して・何を述べたか」の1単位。人物の発言と、ユーザーの推測の総称
 * - 聴取（Interview）: 証言を得た機会（いつ・誰が・どの場で聴き取ったか）。複数の証言をまとめます
 * - 照合（CrossCheck）: 読み手が2件の証言を突き合わせた結果（裏付ける・食い違う・同じ事柄を述べている）
 * - 仮説（Hypothesis）: 読み手の見立て。支える証言・反する証言と、対象の人物ごとの動機・機会・手段の証言をひもづけます
 * - 時刻参照（TimeRef）: 曖昧さを許す日時の表現
 *
 * 注意: このファイルは実データで書き起こして破綻しないかを確かめるためのドラフトです。
 * 未決事項は docs/domain-model.md に記載しています。
 */

/** 各エンティティを一意に識別するID（nanoidで生成する想定）です。 */
export type Id = string;

/**
 * 曖昧さを許す日時の表現です。
 *
 * 精度に応じたISO 8601の部分表記の文字列で持ちます
 * （'1998' / '1998-08' / '1998-08-12' / '1998-08-12T19:00'）。
 * 「1995年7月頃」のように精度の粗い日時は、分かっている精度までを書いて表します（'1995-07'）。
 * 表記は「その期間全体」を表す区間として解釈します（src/domain/time-ref.ts）。
 * 「19:10から19:40の間」のような幅は、ISO 8601の区間表記で持ちます（'2026-09-28T19:10/19:40'）。
 *
 * 注意: 時系列ボード上の位置は、日時ではなくケースの並び順（Case.timelineOrder）で決まります。
 * 日時は、並び順が日時と矛盾していないかの判定にだけ使用します。
 */
export type TimeRef = string;

/**
 * 人物の種別です。
 *
 * - individual: 個人（表示名は「人物」）
 * - organization: 組織（警察、企業など）
 * - record: 記録・媒体（防犯カメラ、通話記録、新聞、書籍、調書、鑑定結果など）
 * - object: 物（凶器、遺留品など）
 */
export type PersonKind = 'individual' | 'organization' | 'record' | 'object';

/**
 * ケースに登場する人物です。
 *
 * 個人だけでなく、組織（警察など）・記録装置（防犯カメラなど）・媒体（新聞、書籍、調書など）を含む、
 * 発言しうる主体の全般を表します。以前の版では媒体を「ソース」という別の種類で持っていましたが、
 * 「新聞が報じた」も「警察が発表した」も同じ「誰かがそう述べた」であるため、人物に統合しました。
 * 個人・組織・記録装置・媒体などの区別は、種別（kind）で持ちます。人ではないものを一覧や各ビューで見分け、
 * 絞り込めるようにするためです。種別によって、証言の発言者・経由・言及としての扱いは変わりません。
 */
export type Person = {
  id: Id;
  name: string;
  /** 種別です。種別を持たない頃に保存したデータは、個人（'individual'）として読み込みます（src/domain/case-schema.ts）。 */
  kind: PersonKind;
  /** 別名・旧姓・偽名などです。 */
  aliases?: string[];
  /** 縮小済みの画像（data URL）です。顔写真のほか、組織のロゴや紙面の画像も入ります。 */
  imageDataUrl?: string;
  /**
   * 画像が無い場合にアイコンへ表示する1文字です。省略した場合は、名前の先頭の文字を表示します。
   * 表示する文字の決定は src/domain/person-icon.ts を参照してください。
   */
  iconText?: string;
  /** メモです。他の人物・場所へのメンション（src/domain/mention.ts）を含められます。 */
  note?: string;
};

/** 地点の座標（世界測地系の緯度・経度。単位は度）です。 */
export type Coordinates = { latitude: number; longitude: number };

/** ケースに登場する場所です。緯度経度は、場所のフォームの座標欄で登録し、地図ビューで使用します。 */
export type Place = {
  id: Id;
  name: string;
  latitude?: number;
  longitude?: number;
  /** 縮小済みの画像（data URL）です。 */
  imageDataUrl?: string;
  /** メモです。他の人物・場所へのメンション（src/domain/mention.ts）を含められます。 */
  note?: string;
};

/**
 * 証言を述べた主体です。
 *
 * - person: 人物の発言。複数人が同じことを述べたと伝えられている場合は、全員を personIds に持ちます（1人以上）。
 *   別の経路や別の時点でそれぞれが述べた場合は、独立した裏付けかどうかを比べられるよう、別々の証言にします。
 *   報道の地の文や漫画のナレーションは、その媒体（人物として登録します）の発言です。
 * - user: ユーザー自身の推測
 */
export type Speaker = { kind: 'person'; personIds: Id[] } | { kind: 'user' };

/**
 * 「誰が・誰を経由して・何を述べたか」の1単位です。
 *
 * 人物の発言とユーザーの推測は同じ型で表し、speaker の違いで区別します。
 * 「出来事」を表す型はありません。未解決事件では、警察発表の時系列も含めて、語られる出来事はすべて誰かの証言であり、
 * 特定の見立てを基準に置くと比較が偏るためです。ユーザー自身の見立ても、発言者が 'user' の証言として同列に記述します。
 */
export type Claim = {
  id: Id;
  speaker: Speaker;
  /**
   * 発言者の発言をユーザーに伝えた人物です。伝えた順に並べ、最後の要素がユーザーが直接見聞きした相手です。
   * 例「Aが自供したと警察の調書にある」→ speaker: A、viaPersonIds: [警察の調書]
   * 例「防犯カメラに映っていたと県警が発表したと新聞が報じた」→ speaker: 防犯カメラ、viaPersonIds: [県警, 新聞]
   * 発言者から直接見聞きした場合と、ユーザーの推測では、空の配列です。
   * 経由を残すのは、複数の証言が独立した裏付けなのか、同じ経路から出た1つの情報なのかを判断するためです。
   */
  viaPersonIds: Id[];
  /**
   * 資料内の位置です（ページ番号、話数、動画のタイムスタンプなど）。
   * 注意: 入力欄は廃止しました。以前の版で入力された値を失わないために保持している項目です。
   */
  locator?: string;
  /**
   * 本文を要約する見出しです。本文が長い証言を、ボードや一覧で見分けやすくするために付けます。
   * 注意: メンションには対応していません。場所・言及している人物は、本文（content）からだけ導出します。
   */
  title?: string;
  /** 述べられた内容です。 */
  content: string;
  /** この証言が言及している人物です。 */
  mentionedPersonIds: Id[];
  /**
   * この証言が述べる内容の日時です。時系列ボード上の位置は決めませんが、
   * 日時と矛盾する位置には並べられません（src/domain/timeline-order.ts）。
   */
  when?: TimeRef;
  /** この証言が述べる内容の場所です。 */
  placeId?: Id;
  /**
   * この証言を得た聴取です。聴取の相手は、この証言の発言者か経由のいずれかに含まれます（src/domain/case-schema.ts）。
   * 相手が発言者なら直接の供述、経由の一段なら、伝聞のその段が述べた機会を表します。
   */
  interviewId?: Id;
};

/**
 * 証言を得た機会（取得の経緯）です。取り調べ・事情聴取・取材・記者会見・記事などを表します。
 *
 * 証言1件ずつに述べた時点を持たせる形（以前の Claim.statedAt）は、入力の手間に見合わず廃止しました。
 * 代わりに、同じ機会に得た複数の証言を1件の聴取にまとめ、証言は任意で聴取を参照します（Claim.interviewId）。
 * 同じ人物の聴取を日時の順に並べると、供述の変遷（初回の供述と後の供述の食い違い）を追えます（src/domain/interviews.ts）。
 */
export type Interview = {
  id: Id;
  /** 供述した相手です。 */
  subjectPersonId: Id;
  /** 聴き取った人物、または記事・番組などの媒体です。 */
  interviewerPersonId?: Id;
  /** 聴取の日時です。 */
  at?: TimeRef;
  /** 聴取の場所です。 */
  placeId?: Id;
  /** 聴取の時点での相手の立場です（参考人・被疑者・目撃者など。自由な文字列です）。 */
  subjectRole?: string;
  /** 資料番号です（調書番号・記事のURLなど）。 */
  documentRef?: string;
};

/**
 * 照合の種類です。
 * - supports: 2件の証言が互いを裏付ける
 * - contradicts: 2件の証言が食い違う
 * - sameSubject: 2件の証言が同じ事柄を述べている（裏付けとも食い違いとも言えない）
 */
export type CrossCheckKind = 'supports' | 'contradicts' | 'sameSubject';

/**
 * 読み手が2件の証言を突き合わせた結果です。
 *
 * 食い違いや裏付けは自動では判定せず、読み手が時系列ボードで見比べて見つけた判断を、明示的なリンクとして残します。
 * どちらの証言が正しいかは判定しません（証言に真偽の評価を付けない方針は変えません）。
 * 照合は2件の証言の間の向きを持たない関係として扱い、claimIds の並びに意味はありません。
 * どこがどう一致したか、どう食い違ったかを残すため、理由（reason）は必須です（空白だけの理由は src/domain/case-schema.ts で拒否します）。
 */
export type CrossCheck = {
  id: Id;
  /** 突き合わせた2件の証言です。同じ証言を2つ指定することはできません。 */
  claimIds: [Id, Id];
  kind: CrossCheckKind;
  /** 照合の理由です。 */
  reason: string;
};

/**
 * 仮説の状態です。
 * - open: 検討中
 * - likely: 有力
 * - rejected: 否定された（否定の理由を必ず持ちます）
 */
export type HypothesisStatus = 'open' | 'likely' | 'rejected';

/**
 * 被疑者を検討する観点です。
 * - motive: 動機
 * - opportunity: 機会
 * - means: 手段
 */
export type HypothesisAspect = 'motive' | 'opportunity' | 'means';

/** 仮説が対象とする人物1人と、観点（動機・機会・手段）ごとに整理した証言です。 */
export type HypothesisTarget = {
  personId: Id;
  /** 観点ごとの、関連する証言です。 */
  claimIds: Record<HypothesisAspect, Id[]>;
};

/**
 * 読み手の見立て（仮説）です。
 *
 * 複数の見立てを同時に持ち、証言で1つずつ消していく作業を記録します。
 * 判断（有力・否定）は仮説の側に置き、証言そのものには真偽の評価を付けません（証言は一次データのまま保ちます）。
 * 否定された仮説も削除せずに残し、否定の理由（rejectionReason）を記録します。
 * 否定の理由は、否定された仮説にだけ持たせます（否定されていない仮説の理由・空白だけの理由は src/domain/case-schema.ts で拒否します）。
 * 同じ証言を、支える証言と反する証言の両方にひもづけることはできません。
 */
export type Hypothesis = {
  id: Id;
  /** 見出しです。 */
  title: string;
  /** 説明です。 */
  description?: string;
  status: HypothesisStatus;
  /** 否定の理由です。否定された仮説にだけ持たせます。 */
  rejectionReason?: string;
  /** 仮説を支える証言です。 */
  supportingClaimIds: Id[];
  /** 仮説に反する証言です。 */
  opposingClaimIds: Id[];
  /** 仮説が対象とする人物です。同じ人物を2回以上含めることはできません。 */
  targets: HypothesisTarget[];
};

/**
 * 人物間の関係です。
 *
 * 関係はユーザーが証言から導いた結論として扱い、根拠となる証言を basisClaimIds で参照します。
 * basisClaimIds が空の関係は「根拠未登録」として表示上区別します。
 */
export type Relationship = {
  id: Id;
  fromPersonId: Id;
  toPersonId: Id;
  label: string;
  /** true の場合は from から to への片方向、false の場合は双方向の関係です。 */
  directed: boolean;
  basisClaimIds: Id[];
};

/** 1つの事件、または1つの作品を表す入れ物です。 */
export type Case = {
  id: Id;
  name: string;
  persons: Person[];
  places: Place[];
  claims: Claim[];
  relationships: Relationship[];
  /** 証言を得た聴取です。 */
  interviews: Interview[];
  /** 読み手が証言同士を突き合わせた照合です。 */
  crossChecks: CrossCheck[];
  /** 読み手の見立て（仮説）です。 */
  hypotheses: Hypothesis[];
  /**
   * 時系列ボードの証言の並び順です。要素は 'claim:証言のID' の形のキーです。
   * 載っていない証言は末尾に並べ、存在しない証言のキーは無視します（src/domain/timeline-order.ts）。
   */
  timelineOrder: string[];
  /**
   * 人物の動きビューの列（人物）の並び順です。要素は人物のIDです。
   * 載っていない人物は末尾に登録順で並べ、存在しない人物のIDは無視します（src/domain/person-lane-order.ts）。
   */
  personLaneOrder: Id[];
};
