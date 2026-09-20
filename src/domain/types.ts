/**
 * ドメインモデルの型定義（検証用ドラフト）
 *
 * このファイルは、調査ボードが扱う一次データの形を定義します。
 * 設計の中心は「主張（Claim）」です。人物相関図・時系列・証言者別・地図の各ビューは、
 * すべて主張と出来事の集合から導出される表示であり、一次データではありません。
 *
 * 用語:
 * - 案件（Case）: 1つの事件、または1つの作品。すべてのデータの入れ物
 * - ソース（Source）: 主張の出どころとなる資料（記事・書籍・判決文・漫画の話数など）
 * - 主張（Claim）: 「誰が・どのソースで・何を述べたか」の1単位。証言とユーザーの推測の総称
 * - 出来事（Event）: 起きたとされること。ユーザーが現時点で採用している見立てを保持する
 * - 時刻参照（TimeRef）: 曖昧さを許す時刻の表現
 *
 * 注意: このファイルは実データで書き起こして破綻しないかを確かめるためのドラフトです。
 * 未決事項は docs/domain-model.md に記載しています。
 */

/** 各エンティティを一意に識別するID（nanoidで生成する想定）です。 */
export type Id = string;

/**
 * 曖昧さを許す時刻の表現です。
 *
 * 「1995年7月頃」「17年前」「第3話」のように、資料に現れる時刻は精度がばらばらです。
 * そのため、原文表記を必ず保持し、機械的に並べるための情報を任意で添える形にしています。
 *
 * - 実在の日時が分かる場合: earliest と latest に区間を入れます。
 *   例「1995年7月頃」→ earliest: '1995-06-01', latest: '1995-08-31'
 * - 実在の日時が無い場合（作中の時系列や話数など）: order に並び順の数値を入れます。
 *
 * 注意: earliest と order の両方が無い時刻参照は、時系列ビューでは「時期不明」の列に置かれます。
 */
export type TimeRef = {
  /** 資料に書かれていた通りの表記です。 */
  text: string;
  /**
   * 取り得る最も早い時点です。精度に応じたISO 8601の部分表記で指定します
   * （'1998' / '1998-08' / '1998-08-12' / '1998-08-12T19:00'）。
   */
  earliest?: string;
  /**
   * 取り得る最も遅い時点です。表記の形式は earliest と同じです。
   * 省略した場合は、earliest が表す期間の終わり（'1998' なら1998年末）までの区間として扱います。
   */
  latest?: string;
  /** 実在の日時が無い場合の並び順です。小さいほど先に並びます。 */
  order?: number;
};

/** ソースの種類です。 */
export type SourceKind =
  | 'article'
  | 'book'
  | 'court-record'
  | 'broadcast'
  | 'web'
  | 'fiction-episode'
  | 'other';

/** 主張の出どころとなる資料です。 */
export type Source = {
  id: Id;
  title: string;
  kind: SourceKind;
  url?: string;
  /** 公開・刊行された時点です。漫画の話数のように順序だけが意味を持つ場合は order を使います。 */
  publishedAt?: TimeRef;
  note?: string;
};

/** 案件に登場する人物です。 */
export type Person = {
  id: Id;
  name: string;
  /** 別名・旧姓・偽名などです。 */
  aliases?: string[];
  imageDataUrl?: string;
  note?: string;
};

/** 案件に登場する場所です。緯度経度は地図ビューを作る段階で使用します。 */
export type Place = {
  id: Id;
  name: string;
  latitude?: number;
  longitude?: number;
  note?: string;
};

/**
 * 起きたとされることです。
 *
 * when・placeId・participantIds は「ユーザーが現時点で採用している見立て」を表します。
 * 個々の証言が述べる日時や場所は Claim 側に保持するため、両者が食い違っていれば
 * それが「証言の矛盾」として表示されます。
 */
export type Event = {
  id: Id;
  title: string;
  description?: string;
  when?: TimeRef;
  placeId?: Id;
  participantIds: Id[];
};

/**
 * 主張を述べた主体です。
 *
 * - person: 登場人物の証言・台詞
 * - source: 発言者を特定できないソース自体の記述（報道の地の文、漫画のナレーションなど）
 * - user: ユーザー自身の推測
 */
export type Speaker =
  | { kind: 'person'; personId: Id }
  | { kind: 'source' }
  | { kind: 'user' };

/** 主張に対するユーザーの評価です。 */
export type Assessment = 'credible' | 'doubtful' | 'unverified';

/**
 * 「誰が・どのソースで・何を述べたか」の1単位です。
 *
 * 証言とユーザーの推測は同じ型で表し、speaker の違いで区別します。
 *
 * 注意: speaker が 'user' 以外の場合は sourceId を必ず指定してください。
 * 出どころを示せない証言は検証できないためです（この制約は型では表現しておらず、
 * 保存時の検証で担保する想定です）。
 */
export type Claim = {
  id: Id;
  speaker: Speaker;
  sourceId?: Id;
  /** ソース内の位置です（ページ番号、話数、動画のタイムスタンプなど）。 */
  locator?: string;
  /** 述べられた内容です。 */
  content: string;
  /** この主張が述べられた時点です。出来事が起きた時点とは別の時間軸です。 */
  statedAt?: TimeRef;
  /** この主張が対象とする出来事です。人物評のように出来事を伴わない主張では省略します。 */
  eventId?: Id;
  /** この主張が言及している人物です。 */
  mentionedPersonIds: Id[];
  /** この主張が述べる出来事の日時です。Event.when と食い違う場合があります。 */
  when?: TimeRef;
  /** この主張が述べる出来事の場所です。Event.placeId と食い違う場合があります。 */
  placeId?: Id;
  assessment: Assessment;
};

/**
 * 人物間の関係です。
 *
 * 関係はユーザーが主張から導いた結論として扱い、根拠となる主張を basisClaimIds で参照します。
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
  sources: Source[];
  persons: Person[];
  places: Place[];
  events: Event[];
  claims: Claim[];
  relationships: Relationship[];
};
