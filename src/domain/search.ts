/**
 * ボード全体の検索と、人物の識別子の突き合わせ
 *
 * 証言が数十件を超えると「あの証言はどこにあったか」を探す手間が増えるため、証言・人物・場所を横断して検索します（searchCase）。
 * 検索の対象は、証言の見出しと本文（メンションは現在の名前に置き換えた文字列）、人物の名前・別名・メモ・識別子の値、
 * 場所の名前・メモです。
 *
 * 電話番号・車両ナンバーなどの識別子の値が一致する人物同士は、名寄せの判断材料として、互いの詳細に示します
 * （findPersonsSharingIdentifiers）。「同一人物である」と結ぶ操作は持ちません（docs/domain-model.md の未決事項6）。
 *
 * 文字列の比較は、検索と識別子の突き合わせで同じ規則（normalizeForMatching）を使います。
 * 全角と半角・ハイフン・空白・英字の大文字と小文字の違いを吸収するため、識別子の値で検索すると、
 * 表記の違う値を本文に含む証言もたどれます。
 */
import { buildTimeline, type ClaimView } from './case-views';
import { contentToPlainText } from './mention';
import type { Case, Id, Person, PersonIdentifier, Place } from './types';

/**
 * 比較の前に取り除く文字です。空白と、ハイフンに見える文字（ハイフン・ダッシュ・マイナス・長音記号）です。
 * 長音記号（ー）を含めるのは、日本語入力で電話番号のハイフンを長音記号で打つ表記の揺れがあるためです。
 */
const IGNORED_CHARACTERS_PATTERN = /[\s\-‐‑‒–—―−ー]/g;

/**
 * 比較用に文字列を正規化します。
 * 全角の英数字・記号を半角に（Unicode の NFKC 正規化）、英字を小文字にそろえ、空白とハイフンに見える文字を取り除きます。
 *
 * 注意: 長音記号も取り除くため、「ナンバー」は「ナンバ」と同じ文字列になります。検索の取りこぼしを避けることを優先しています。
 */
export function normalizeForMatching(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(IGNORED_CHARACTERS_PATTERN, '');
}

/** 同じ値の識別子を持つ人物と、その人物の側の一致した識別子です。 */
export type IdentifierMatch = {
  person: Person;
  /** 相手の人物が持つ識別子のうち、値が一致したものです（相手の人物が登録した種類と表記のまま）。 */
  identifiers: PersonIdentifier[];
};

/**
 * 指定した人物と同じ値の識別子を持つ人物を、ケースの人物の登録順で返します。
 * 識別子の種類は比較に使いません。「電話番号」と「携帯電話」のように、同じものを違う種類の名前で登録しうるためです。
 * 人物が識別子を持たない場合と、人物が見つからない場合は、空の配列を返します。
 * 正規化すると空になる値（ハイフンや空白だけの値）は、比較に使いません。
 */
export function findPersonsSharingIdentifiers(target: Case, personId: Id): IdentifierMatch[] {
  const person = target.persons.find((candidate) => candidate.id === personId);
  // ハイフンだけの値のように正規化すると空になる値は、どの人物とも一致させない
  const ownValues = new Set(
    (person?.identifiers ?? []).map((identifier) => normalizeForMatching(identifier.value)).filter((value) => value !== '')
  );
  if (ownValues.size === 0) return [];

  return target.persons.flatMap((other) => {
    if (other.id === personId) return [];
    const identifiers = (other.identifiers ?? []).filter((identifier) => ownValues.has(normalizeForMatching(identifier.value)));
    return identifiers.length > 0 ? [{ person: other, identifiers }] : [];
  });
}

/** 検索語に一致した項目の名前です。検索結果で、どこに一致したのかを示すために使います。 */
export type SearchField = '見出し' | '本文' | '名前' | '別名' | 'メモ' | '識別子';

/** 検索語に一致した証言です。 */
export type ClaimSearchHit = { view: ClaimView; fields: SearchField[] };
/** 検索語に一致した人物です。 */
export type PersonSearchHit = { person: Person; fields: SearchField[] };
/** 検索語に一致した場所です。 */
export type PlaceSearchHit = { place: Place; fields: SearchField[] };

/** 検索結果です。種類ごとに分けて持ちます。 */
export type SearchResults = {
  /** 時系列ボードの並び順で並べた証言です。 */
  claims: ClaimSearchHit[];
  /** ケースの登録順で並べた人物です。 */
  persons: PersonSearchHit[];
  /** ケースの登録順で並べた場所です。 */
  places: PlaceSearchHit[];
};

/** 検索の対象とする項目の名前と、その項目の文字列（複数の値を持つ項目は複数）の組です。 */
type SearchableField = { field: SearchField; texts: string[] };

/** 検索語（正規化済み）に一致した項目の名前を、対象の項目の並び順で返します。 */
function matchedFields(normalizedQuery: string, fields: SearchableField[]): SearchField[] {
  return fields
    .filter(({ texts }) => texts.some((text) => normalizeForMatching(text).includes(normalizedQuery)))
    .map(({ field }) => field);
}

/**
 * 証言・人物・場所を横断して検索します。
 * 一致の判定は、検索語と対象の文字列をどちらも normalizeForMatching で正規化したうえでの部分一致です。
 * 正規化すると空になる検索語（空白やハイフンだけの検索語）では、何も返しません。
 */
export function searchCase(target: Case, query: string): SearchResults {
  const normalizedQuery = normalizeForMatching(query);
  if (normalizedQuery === '') return { claims: [], persons: [], places: [] };

  const claims = buildTimeline(target).items.flatMap(({ view }) => {
    const fields = matchedFields(normalizedQuery, [
      { field: '見出し', texts: view.claim.title === undefined ? [] : [view.claim.title] },
      { field: '本文', texts: [contentToPlainText(view.claim.content, target)] },
    ]);
    return fields.length > 0 ? [{ view, fields }] : [];
  });

  const persons = target.persons.flatMap((person) => {
    const fields = matchedFields(normalizedQuery, [
      { field: '名前', texts: [person.name] },
      { field: '別名', texts: person.aliases ?? [] },
      { field: 'メモ', texts: person.note === undefined ? [] : [contentToPlainText(person.note, target)] },
      { field: '識別子', texts: (person.identifiers ?? []).map((identifier) => identifier.value) },
    ]);
    return fields.length > 0 ? [{ person, fields }] : [];
  });

  const places = target.places.flatMap((place) => {
    const fields = matchedFields(normalizedQuery, [
      { field: '名前', texts: [place.name] },
      { field: 'メモ', texts: place.note === undefined ? [] : [contentToPlainText(place.note, target)] },
    ]);
    return fields.length > 0 ? [{ place, fields }] : [];
  });

  return { claims, persons, places };
}
