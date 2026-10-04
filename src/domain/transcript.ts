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

/** YouTube の動画ID（英数字・「-」・「_」の11文字）です。 */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** 動画IDをパスの2つ目の区切りに持つ、YouTube のURLのパスの種類です（例「/shorts/動画ID」）。 */
const YOUTUBE_VIDEO_PATH_PREFIXES = new Set(['shorts', 'live', 'embed']);

/**
 * YouTube の埋め込みプレーヤーのURLの接頭辞です。
 * 再生するまで閲覧者の Cookie を保存しない、プライバシー強化モード（youtube-nocookie.com）を使います。
 */
const YOUTUBE_EMBED_URL_PREFIX = 'https://www.youtube-nocookie.com/embed/';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/** 省略せずに表示する本文の、文字数の上限です。これを超える本文は、資料の一覧で省略して表示します。 */
export const LONG_TRANSCRIPT_MAX_LENGTH = 300;

/** 省略せずに表示する本文の、行数の上限です。これを超える本文は、資料の一覧で省略して表示します。 */
export const LONG_TRANSCRIPT_MAX_LINES = 8;

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

/** splitTimestampLines で切り出した区切りです。時刻だけの行の区切りは、その時刻の秒数（seconds）を持ちます。 */
export type TimestampPart = { text: string; seconds?: number };

/**
 * 文字列を、時刻だけの行（行末の改行を除く）と、それ以外の部分に切り分けます。
 * 本文の時刻の行を、動画をその位置から再生するボタンとして描くために使います。
 * 区切りの text をつなぐと、元の文字列に戻ります（本文の中の位置を、描いた文字数で求めるためです）。
 */
export function splitTimestampLines(text: string): TimestampPart[] {
  const parts: TimestampPart[] = [];
  let plain = '';
  text.split('\n').forEach((line, index) => {
    // 2行目以降は、前の行との間の改行を、時刻の行でない部分に含める
    if (index > 0) plain += '\n';
    const seconds = timestampLineToSeconds(line);
    if (seconds === undefined) {
      plain += line;
      return;
    }
    if (plain !== '') parts.push({ text: plain });
    parts.push({ text: line, seconds });
    plain = '';
  });
  if (plain !== '') parts.push({ text: plain });
  return parts;
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

/**
 * 本文が、資料の一覧で省略して表示するほど長いかどうかを返します。
 * 文字数か行数のどちらかが上限を超える場合に長いとします（動画の文字起こしは、1行が短く行数が多いためです）。
 * 注意: 描画後の高さではなく文字数と行数で判定するため、画面の幅によっては、省略しても隠れる行が無い場合があります。
 */
export function isLongTranscript(transcript: string): boolean {
  return transcript.length > LONG_TRANSCRIPT_MAX_LENGTH || transcript.split('\n').length > LONG_TRANSCRIPT_MAX_LINES;
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
 * YouTube のURLかどうかを返します。
 * YouTube の字幕は公式APIでは動画の所有者しか取得できないため、記事の本文の取得（src/lib/article-fetch-api.ts）で、
 * 取得せずに文字起こしの貼り付けを案内するために使います。
 */
export function isYoutubeUrl(url: string): boolean {
  return isHttpUrl(url) && YOUTUBE_HOSTS.has(new URL(url).hostname);
}

/**
 * YouTube の動画のURLに、seconds 秒目から再生する指定（t）を付けたURLを返します。
 * YouTube 以外のURLでは undefined です（再生位置の指定の書き方がサイトごとに異なるためです）。
 */
export function youtubeUrlAt(url: string, seconds: number): string | undefined {
  if (!isYoutubeUrl(url)) return undefined;
  const parsed = new URL(url);
  parsed.searchParams.set('t', `${seconds}s`);
  return parsed.toString();
}

/** YouTube のURLから動画IDを取り出します。動画を特定できないURL（チャンネル・再生リストなど）では undefined です。 */
function youtubeVideoIdOf(url: string): string | undefined {
  if (!isYoutubeUrl(url)) return undefined;
  const parsed = new URL(url);
  const [first, second] = parsed.pathname.split('/').filter(Boolean);
  const candidate =
    parsed.hostname === 'youtu.be'
      ? first
      : first === 'watch'
        ? parsed.searchParams.get('v')
        : first !== undefined && YOUTUBE_VIDEO_PATH_PREFIXES.has(first)
          ? second
          : undefined;
  return candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
}

/**
 * YouTube の動画のURLから、埋め込みプレーヤー（iframe）のURLを返します。
 * 資料の詳細で、動画を別のタブで開かずに見られるようにするために使います。
 * startSeconds を渡すと、その秒数から自動で再生する指定（start・autoplay）を付けます。引用の時刻から再生するときに使います。
 * 動画を特定できない YouTube のURLと、YouTube 以外のURLでは undefined です。
 */
export function youtubeEmbedUrl(url: string, startSeconds?: number): string | undefined {
  const videoId = youtubeVideoIdOf(url);
  if (videoId === undefined) return undefined;
  const embedUrl = `${YOUTUBE_EMBED_URL_PREFIX}${videoId}`;
  return startSeconds === undefined ? embedUrl : `${embedUrl}?start=${startSeconds}&autoplay=1`;
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
