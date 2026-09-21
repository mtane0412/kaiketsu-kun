/**
 * 他の証言へのリンク
 *
 * 証言の詳細（ClaimDetail）と、人物・場所の詳細（EntityDetail）で共有します。
 * 誰の発言かを見分けられるよう、発言者と経由した人物を先に示し、続けて証言の名前（見出し、または本文の冒頭）と、
 * 証言が述べる日時を示します。開いているタブ（tab）は、リンク先のURLに引き継ぎます。
 */
'use client';

import Link from 'next/link';
import { claimLabelOf, formatViaLabel, type ClaimView } from '@/domain/case-views';
import { formatTimeRef } from '@/domain/time-ref';
import { claimHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

type ClaimLinkProps = {
  view: ClaimView;
  /** 「ボードに戻る」の戻り先として、リンク先のURLに引き継ぐタブです。 */
  tab: TabKey;
  /** 証言の並びの中での位置づけを示す、先頭に添える短い文字列です（「前の証言」など）。 */
  prefix?: string;
};

export function ClaimLink({ view, tab, prefix }: ClaimLinkProps) {
  const caseId = useCaseId();

  return (
    <Link
      href={claimHref(caseId, view.claim.id, tab)}
      className="block rounded border border-slate-200 bg-white px-3 py-2 text-sm hover:border-sky-400"
    >
      {prefix && <span className="mr-2 text-xs text-slate-500">{prefix}</span>}
      <span className="mr-2 text-xs font-semibold text-slate-700">
        {view.speakerLabel}
        {formatViaLabel(view.viaPersons.map((person) => person.name))}
      </span>
      <span className="text-slate-900">{claimLabelOf(view)}</span>
      {view.claim.when && <span className="ml-2 text-xs text-sky-700">{formatTimeRef(view.claim.when)}</span>}
    </Link>
  );
}
