/**
 * 記事のページの HTML から、本文・題名・公開日時を取り出す処理（サーバーだけで使います）
 *
 * 本文は @mozilla/readability（Firefox のリーダービューと同じ処理）で、メニュー・広告・関連記事などを除いて取り出します。
 * サーバーには DOM が無いため、DOM は linkedom で作ります（jsdom より小さく、関数の大きさを抑えられるためです）。
 *
 * 本文はプレーンテキストで返します。証言の引用は本文と文字列の一致で照らし合わせるため（src/domain/transcript.ts の findQuoteRange）、
 * HTML のタグは残さず、ブラウザの表示と同じく連続する空白を1つにまとめます。段落などのかたまりと改行（br）の区切りは改行で残します。
 */
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { ArticleFetchError } from './article-download';
import type { FetchedArticle } from './article-fetch-api';

/** 前後を改行で区切る、かたまりの要素です。 */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

/** HTML で1つにまとめる空白（半角の空白・タブ・改行）です。全角の空白は本文の文字として残します。 */
const COLLAPSIBLE_WHITESPACE = /[ \t\n\r\f]+/g;

/** DOM のノードの種類です（Node.TEXT_NODE・Node.ELEMENT_NODE。サーバーには DOM の Node が無いため、値を持ちます）。 */
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** 公開日時（ISO 8601）の先頭の、年月日と時分です。 */
const PUBLISHED_AT_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/;

/** ノードの中の文字を、かたまりと br の区切りを改行にして集めます。 */
function collectText(node: Node, parts: string[]): void {
  if (node.nodeType === TEXT_NODE) {
    parts.push((node.textContent ?? '').replace(COLLAPSIBLE_WHITESPACE, ' '));
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  if (node.nodeName === 'BR') {
    parts.push('\n');
    return;
  }
  const isBlock = BLOCK_TAGS.has(node.nodeName);
  if (isBlock) parts.push('\n');
  for (const child of Array.from(node.childNodes)) collectText(child, parts);
  if (isBlock) parts.push('\n');
}

/** Readability が取り出した本文の HTML を、段落ごとに改行で区切ったプレーンテキストにします。 */
function htmlToPlainText(contentHtml: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${contentHtml}</body></html>`);
  const parts: string[] = [];
  collectText(document.body, parts);
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

/** 公開日時を、聴取の日時の欄に入れられる表記（記事の現地時刻の「1998-08-13T06:30」か「1998-08-13」）にします。 */
function toPublishedAt(publishedTime: string | null | undefined): string | undefined {
  const matched = PUBLISHED_AT_PATTERN.exec(publishedTime?.trim() ?? '');
  if (!matched) return undefined;
  const [, date, time] = matched;
  return time ? `${date}T${time}` : date;
}

/**
 * 記事のページの HTML から、本文・題名・公開日時を取り出します。
 * 本文を取り出せない場合は、ArticleFetchError（422）にします。
 * @param url - ページのURLです。相対リンクの解決に使います。
 */
export function extractArticle(html: string, url: string): FetchedArticle {
  const { document } = parseHTML(html);
  // Readability は相対リンクをページのURLで解決するため、ページのURLを base として持たせる
  const base = document.createElement('base');
  base.setAttribute('href', url);
  document.head?.prepend(base);

  const parsed = new Readability(document).parse();
  const text = parsed?.content ? htmlToPlainText(parsed.content) : '';
  if (!parsed || text === '') {
    throw new ArticleFetchError(422, '記事の本文を取り出せませんでした。ページを開いて本文を貼り付けてください。');
  }

  const article: FetchedArticle = { text };
  const title = parsed.title?.trim();
  if (title) article.title = title;
  const publishedAt = toPublishedAt(parsed.publishedTime);
  if (publishedAt) article.publishedAt = publishedAt;
  return article;
}
