/**
 * ボード全体の検索結果
 *
 * サイドバーの検索窓から開き、URLのクエリ（?q=）の検索語で、証言・人物・場所を横断して検索した結果を並べます（searchCase）。
 * 証言・人物・場所の種類ごとに節を分け、どの項目（見出し・本文・名前・別名・メモ・識別子）に一致したのかを示します。
 * 各行は、それぞれの詳細へのリンクです。一致するものが無い種類の節は表示しません。
 * 開いているタブはURLのクエリ（?tab=）から読み取り、閉じるリンクと、詳細へのリンクに引き継ぎます。
 *
 * 注意: useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { personKindSuffixOf } from '@/domain/labels';
import { personIconText } from '@/domain/person-icon';
import { searchCase, type SearchField } from '@/domain/search';
import { useCurrentCase } from '@/stores/useCaseStore';
import { ClaimLink } from './ClaimLink';
import { EntityAvatar } from './EntityAvatar';
import { boardHref, parseTab, personHref, placeHref, SEARCH_QUERY_PARAM, TAB_SEARCH_PARAM } from './routes';
import { useCaseId } from './useCaseId';
import { DetailCloseLink } from './DetailCloseLink';

/** 一致した項目の名前を、行に添える文字列（「名前・別名」など）にします。 */
function formatFields(fields: SearchField[]): string {
  return fields.join('・');
}

/** 検索結果の種類ごとの節です。 */
function ResultSection({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={label} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{count}件</span>
      </h3>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

/** 人物・場所の検索結果の1行です。詳細へのリンクに、一致した項目を添えます。 */
function EntityResultLink({
  href,
  name,
  fields,
  avatar,
}: {
  href: string;
  name: string;
  fields: SearchField[];
  avatar: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 text-sm transition-colors hover:border-foreground/30"
    >
      {avatar}
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{formatFields(fields)}に一致</span>
      </span>
    </Link>
  );
}

export function SearchDetail() {
  const caseId = useCaseId();
  const currentCase = useCurrentCase();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get(TAB_SEARCH_PARAM));
  const query = searchParams.get(SEARCH_QUERY_PARAM) ?? '';
  const results = useMemo(() => searchCase(currentCase, query), [currentCase, query]);
  const hasResults = results.claims.length + results.persons.length + results.places.length > 0;

  return (
    <div className="space-y-6">
      <DetailCloseLink href={boardHref(caseId, tab)} label="検索結果を閉じる" />

      <h2 className="text-lg font-semibold">「{query}」の検索結果</h2>

      {!hasResults && <p className="text-sm text-muted-foreground">一致する証言・人物・場所はありません。</p>}

      {results.claims.length > 0 && (
        <ResultSection label="証言" count={results.claims.length}>
          {results.claims.map(({ view, fields }) => (
            <li key={view.claim.id}>
              <ClaimLink view={view} tab={tab} note={`${formatFields(fields)}に一致`} />
            </li>
          ))}
        </ResultSection>
      )}

      {results.persons.length > 0 && (
        <ResultSection label="人物" count={results.persons.length}>
          {results.persons.map(({ person, fields }) => (
            <li key={person.id}>
              <EntityResultLink
                href={personHref(caseId, person.id, tab)}
                name={`${person.name}${personKindSuffixOf(person.kind)}`}
                fields={fields}
                avatar={
                  <EntityAvatar
                    imageDataUrl={person.imageDataUrl}
                    iconText={personIconText(person)}
                    personKind={person.kind}
                    size="sm"
                  />
                }
              />
            </li>
          ))}
        </ResultSection>
      )}

      {results.places.length > 0 && (
        <ResultSection label="場所" count={results.places.length}>
          {results.places.map(({ place, fields }) => (
            <li key={place.id}>
              <EntityResultLink
                href={placeHref(caseId, place.id, tab)}
                name={place.name}
                fields={fields}
                avatar={<EntityAvatar imageDataUrl={place.imageDataUrl} size="sm" />}
              />
            </li>
          ))}
        </ResultSection>
      )}
    </div>
  );
}
