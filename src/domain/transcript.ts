/**
 * 聴取の本文（記事の本文・動画の文字起こし）と、証言の引用を扱うロジック
 *
 * Web の記事や動画から証言を拾う場面で、証言が資料のどこに書いてあったか、どこで話されていたかに戻れるようにします。
 * - 聴取（Interview）は、ユーザーが貼り付けた本文（transcript）と、資料のURL（url）を持ちます。
 * - 証言（Claim）は、本文から書き起こした場合に、引用（quote。原文と、動画であれば秒数）を持ちます。
 *
 * 引用は本文の中の位置ではなく原文の文字列で持ち、表示のたびに本文から探します（findQuoteRange）。
 * 位置で持つと、本文をあとから書き換えたときにずれるためです。同じ文字列が本文に複数ある場合は、最初の箇所を引用とみなします。
 * 本文に原文が見つからない引用は、黙って無視せず、見つからないことを示します（checkClaimQuote）。
 *
 * 動画の位置は、YouTube の「文字起こしを表示」からコピーした形式（時刻だけの行と文の行が交互に並ぶ）から補います。
 * YouTube の字幕は、公式APIでは動画の所有者しか取得できないため、文字起こしは貼り付けで受け付けます。
 */
import type { Case, Claim, Id } from './types';

/** 時刻だけの行です（例「0:05」「12:34」「1:02:03」）。 */
const TIMESTAMP_LINE_PATTERN = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/;

/** 再生位置の指定（t）を付けられる、YouTube の動画のURLのホスト名です。 */
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be']);

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/**
 * http か https のURLかどうかを返します。
 * 聴取のURLはリンクとして表示するため、javascript: などの別の形式のURLを受け付けないようにします。
 */
export function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'http:' || protocol === 'https:';
}

/** 時刻だけの行を秒数に直します。時刻だけの行でない場合は undefined です。 */
function timestampLineToSeconds(line: string): number | undefined {
  const matched = TIMESTAMP_LINE_PATTERN.exec(line);
  if (!matched) return undefined;
  const [, hours = '0', minutes, seconds] = matched;
  return Number(hours) * SECONDS_PER_HOUR + Number(minutes) * SECONDS_PER_MINUTE + Number(seconds);
}

/**
 * 本文の offset 文字目から選び始めた引用の、動画の位置（秒数）を返します。
 * offset を含む行と、それより前の行のうち、最後の時刻だけの行の時刻です。時刻だけの行が無い本文（記事の本文など）では undefined です。
 */
export function quoteSecondsAt(transcript: string, offset: number): number | undefined {
  const lineEnd = transcript.indexOf('\n', offset);
  const lines = transcript.slice(0, lineEnd === -1 ? undefined : lineEnd).split('\n');
  for (const line of lines.toReversed()) {
    const seconds = timestampLineToSeconds(line);
    if (seconds !== undefined) return seconds;
  }
  return undefined;
}

/**
 * 時刻だけの行を取り除き、前後の空白を整えた文字列を返します。
 * 動画の文字起こしから選んだ引用を、証言の本文の初期値にするときに使います。
 */
export function stripTimestampLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => timestampLineToSeconds(line) === undefined)
    .join('\n')
    .trim();
}

/** 本文の中の範囲です（start 文字目から、end 文字目の手前まで）。 */
export type TextRange = { start: number; end: number };

/** 本文の中で、引用の原文が最初に現れる範囲を返します。見つからない場合は undefined です。 */
export function findQuoteRange(transcript: string, quoteText: string): TextRange | undefined {
  if (quoteText === '') return undefined;
  const start = transcript.indexOf(quoteText);
  return start === -1 ? undefined : { start, end: start + quoteText.length };
}

/** 本文を区切った1区間です。引用された区間は、その区間を引用した証言のIDを持ちます。 */
export type TranscriptSegment = { text: string; claimIds: Id[] };

/**
 * 本文を、引用された区間とそうでない区間に分けます。聴取の本文で、書き起こし済みの範囲を示すために使います。
 * 重なり合う引用は、重なった区間に両方の証言のIDを（quotes の順に）添えます。本文に見つからない引用は区間を作りません。
 */
export function buildTranscriptSegments(transcript: string, quotes: { claimId: Id; text: string }[]): TranscriptSegment[] {
  const ranges = quotes.flatMap(({ claimId, text }) => {
    const range = findQuoteRange(transcript, text);
    return range ? [{ claimId, ...range }] : [];
  });
  const boundaries = [...new Set([0, transcript.length, ...ranges.flatMap((range) => [range.start, range.end])])].toSorted(
    (a, b) => a - b
  );

  // 境界は0から始まるため、隣り合う境界の組（区間の始まりと終わり）を順にたどり、その区間を覆う引用を集める
  const segments: TranscriptSegment[] = [];
  let start = 0;
  for (const end of boundaries.slice(1)) {
    segments.push({
      text: transcript.slice(start, end),
      claimIds: ranges.filter((range) => range.start <= start && end <= range.end).map((range) => range.claimId),
    });
    start = end;
  }
  return segments;
}

/** 動画の位置を「分:秒」（1時間以上は「時:分:秒」）で表します。 */
export function formatQuoteSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * YouTube の動画のURLに、seconds 秒目から再生する指定（t）を付けたURLを返します。
 * YouTube 以外のURLでは undefined です（再生位置の指定の書き方がサイトごとに異なるためです）。
 */
export function youtubeUrlAt(url: string, seconds: number): string | undefined {
  if (!isHttpUrl(url)) return undefined;
  const parsed = new URL(url);
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return undefined;
  parsed.searchParams.set('t', `${seconds}s`);
  return parsed.toString();
}

/**
 * 証言の引用を、ひもづけた聴取の本文と照らし合わせた結果です。
 * - found: 本文に引用の原文がある
 * - notFound: 本文に引用の原文が無い（本文をあとから書き換えた場合など）
 * - noTranscript: 聴取にひもづいていないか、聴取に本文が無いため、照らし合わせられない
 */
export type QuoteCheck = 'found' | 'notFound' | 'noTranscript';

/** 証言の引用を、ひもづけた聴取の本文と照らし合わせます。引用の無い証言は渡さないでください。 */
export function checkClaimQuote(target: Case, claim: Claim): QuoteCheck {
  if (claim.quote === undefined) throw new Error(`引用の無い証言は照らし合わせられません: ${claim.id}`);
  const transcript = target.interviews.find((interview) => interview.id === claim.interviewId)?.transcript;
  if (transcript === undefined) return 'noTranscript';
  return findQuoteRange(transcript, claim.quote.text) ? 'found' : 'notFound';
}
