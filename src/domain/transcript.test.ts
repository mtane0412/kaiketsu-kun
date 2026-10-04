/**
 * 聴取の本文（記事の本文・動画の文字起こし）と、証言の引用を扱うロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from './sample-fictional-case';
import {
  buildTranscriptSegments,
  checkClaimQuote,
  findQuoteRange,
  formatQuoteSeconds,
  isHttpUrl,
  isYoutubeUrl,
  quoteSecondsAt,
  splitTimestampLines,
  stripTimestampLines,
  youtubeEmbedUrl,
  youtubeUrlAt,
} from './transcript';
import type { Case, Claim, Interview } from './types';

/** YouTube の「文字起こしを表示」からコピーした形式（時刻の行と文の行が交互に並ぶ）の本文です。 */
const youtubeTranscript = ['0:00', 'こんばんは、管理人です', '0:05', 'あの夜は別荘が真っ暗でした', '1:02:03', '車もありませんでした'].join('\n');

describe('isHttpUrl', () => {
  it('http と https のURLだけを受け付ける', () => {
    expect(isHttpUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isHttpUrl('http://example.com/news/1')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('ftp://example.com/')).toBe(false);
    expect(isHttpUrl('記事のURL')).toBe(false);
  });
});

describe('quoteSecondsAt', () => {
  it('選んだ範囲の始まりより前にある、最後の時刻の行を秒数で返す', () => {
    const start = youtubeTranscript.indexOf('あの夜は');
    expect(quoteSecondsAt(youtubeTranscript, start)).toBe(5);
  });

  it('時:分:秒の形式の時刻も秒数に直す', () => {
    const start = youtubeTranscript.indexOf('車も');
    expect(quoteSecondsAt(youtubeTranscript, start)).toBe(3723);
  });

  it('時刻の行そのものから選び始めた場合は、その時刻を返す', () => {
    const start = youtubeTranscript.indexOf('0:05');
    expect(quoteSecondsAt(youtubeTranscript, start)).toBe(5);
  });

  it('時刻の行を含まない本文（記事の本文など）では、秒数を返さない', () => {
    expect(quoteSecondsAt('別荘の管理人は「真っ暗だった」と語った。', 5)).toBeUndefined();
  });
});

describe('stripTimestampLines', () => {
  it('時刻だけの行を取り除き、前後の空白を整える', () => {
    expect(stripTimestampLines('0:05\nあの夜は別荘が真っ暗でした\n1:02:03\n車もありませんでした\n')).toBe(
      'あの夜は別荘が真っ暗でした\n車もありませんでした'
    );
  });

  it('時刻を含んでいても、時刻だけではない行は残す', () => {
    expect(stripTimestampLines('19:00 ごろに見回りをした')).toBe('19:00 ごろに見回りをした');
  });
});

describe('findQuoteRange', () => {
  it('本文の中で、引用の原文が最初に現れる範囲を返す', () => {
    const transcript = '真っ暗でした。本当に真っ暗でした。';
    expect(findQuoteRange(transcript, '真っ暗でした')).toEqual({ start: 0, end: 6 });
  });

  it('本文に原文が無い場合は、範囲を返さない', () => {
    expect(findQuoteRange(youtubeTranscript, '明かりがついていた')).toBeUndefined();
  });
});

describe('buildTranscriptSegments', () => {
  it('本文を、引用された範囲とそうでない範囲に分け、引用された範囲にはその証言のIDを添える', () => {
    const segments = buildTranscriptSegments('あの夜、別荘は真っ暗で、車もなかった。', [
      { claimId: 'claim-dark', text: '別荘は真っ暗' },
      { claimId: 'claim-car', text: '車もなかった' },
    ]);

    expect(segments).toEqual([
      { text: 'あの夜、', claimIds: [] },
      { text: '別荘は真っ暗', claimIds: ['claim-dark'] },
      { text: 'で、', claimIds: [] },
      { text: '車もなかった', claimIds: ['claim-car'] },
      { text: '。', claimIds: [] },
    ]);
  });

  it('重なり合う引用は、重なった範囲に両方の証言のIDを添える', () => {
    const segments = buildTranscriptSegments('別荘は真っ暗だった', [
      { claimId: 'claim-villa', text: '別荘は真っ暗' },
      { claimId: 'claim-dark', text: '真っ暗だった' },
    ]);

    expect(segments).toEqual([
      { text: '別荘は', claimIds: ['claim-villa'] },
      { text: '真っ暗', claimIds: ['claim-villa', 'claim-dark'] },
      { text: 'だった', claimIds: ['claim-dark'] },
    ]);
  });

  it('本文に見つからない引用は、範囲を作らない', () => {
    expect(buildTranscriptSegments('別荘は真っ暗だった', [{ claimId: 'claim-lost', text: '明かり' }])).toEqual([
      { text: '別荘は真っ暗だった', claimIds: [] },
    ]);
  });
});

describe('formatQuoteSeconds', () => {
  it('1時間未満は分:秒、1時間以上は時:分:秒で表す', () => {
    expect(formatQuoteSeconds(5)).toBe('0:05');
    expect(formatQuoteSeconds(754)).toBe('12:34');
    expect(formatQuoteSeconds(3723)).toBe('1:02:03');
  });
});

describe('youtubeUrlAt', () => {
  it('YouTube の動画のURLに、指定した秒数から再生する指定（t）を付ける', () => {
    expect(youtubeUrlAt('https://www.youtube.com/watch?v=abc', 754)).toBe('https://www.youtube.com/watch?v=abc&t=754s');
    expect(youtubeUrlAt('https://youtu.be/abc', 5)).toBe('https://youtu.be/abc?t=5s');
  });

  it('すでに再生位置の指定があるURLは、指定を置き換える', () => {
    expect(youtubeUrlAt('https://m.youtube.com/watch?v=abc&t=10s', 754)).toBe('https://m.youtube.com/watch?v=abc&t=754s');
  });

  it('YouTube 以外のURLには、再生位置の指定を付けない', () => {
    expect(youtubeUrlAt('https://example.com/watch?v=abc', 754)).toBeUndefined();
  });
});

describe('isYoutubeUrl', () => {
  it('YouTube の動画のURLを YouTube のURLとみなす', () => {
    expect(isYoutubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYoutubeUrl('https://youtu.be/abc')).toBe(true);
    expect(isYoutubeUrl('http://m.youtube.com/watch?v=abc')).toBe(true);
  });

  it('YouTube 以外のURLと、URLとして読めない文字列は YouTube のURLとみなさない', () => {
    expect(isYoutubeUrl('https://example.com/news/1')).toBe(false);
    expect(isYoutubeUrl('youtube.com の動画')).toBe(false);
  });
});

describe('splitTimestampLines', () => {
  it('時刻だけの行を、秒数を持つ区切りとして切り出す（区切りをつなぐと元の文字列に戻る）', () => {
    const parts = splitTimestampLines(youtubeTranscript);
    expect(parts).toEqual([
      { text: '0:00', seconds: 0 },
      { text: '\nこんばんは、管理人です\n' },
      { text: '0:05', seconds: 5 },
      { text: '\nあの夜は別荘が真っ暗でした\n' },
      { text: '1:02:03', seconds: 3723 },
      { text: '\n車もありませんでした' },
    ]);
    expect(parts.map((part) => part.text).join('')).toBe(youtubeTranscript);
  });

  it('時刻だけの行の無い文字列は、1つの区切りのまま返す', () => {
    expect(splitTimestampLines('管理人は「真っ暗でした」と話した。')).toEqual([{ text: '管理人は「真っ暗でした」と話した。' }]);
  });
});

describe('youtubeEmbedUrl', () => {
  it('YouTube の動画のURLから、埋め込みプレーヤーのURLを作る', () => {
    const embedUrl = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embedUrl);
    expect(youtubeEmbedUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe(embedUrl);
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=share')).toBe(embedUrl);
    expect(youtubeEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(embedUrl);
    expect(youtubeEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(embedUrl);
    expect(youtubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(embedUrl);
  });

  it('再生を始める秒数を渡すと、その位置から自動で再生する指定（start・autoplay）を付ける', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 754)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=754&autoplay=1'
    );
  });

  it('動画を特定できない YouTube のURLと、YouTube 以外のURLでは undefined を返す', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/@channel')).toBeUndefined();
    expect(youtubeEmbedUrl('https://www.youtube.com/playlist?list=PL123')).toBeUndefined();
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=短すぎる')).toBeUndefined();
    expect(youtubeEmbedUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(youtubeEmbedUrl('youtube.com の動画')).toBeUndefined();
  });
});

describe('checkClaimQuote', () => {
  /** 管理人へのインタビュー動画の聴取です（文字起こしを貼り付けています）。 */
  const videoInterview: Interview = {
    id: 'interview-video',
    title: '管理人へのインタビュー',
    url: 'https://www.youtube.com/watch?v=abc',
    transcript: youtubeTranscript,
  };
  /** 文字起こしを貼り付けていない聴取です。 */
  const blankInterview: Interview = { id: 'interview-blank' };

  const baseClaim = sampleFictionalCase.claims.find((claim) => claim.id === 'claim-caretaker') as Claim;
  const caseWith = (claim: Claim): Case => ({
    ...sampleFictionalCase,
    interviews: [videoInterview, blankInterview],
    claims: [claim],
  });

  it('引用の原文が、ひもづけた聴取の本文にある場合は found を返す', () => {
    const claim: Claim = { ...baseClaim, interviewId: videoInterview.id, quote: { text: 'あの夜は別荘が真っ暗でした', seconds: 5 } };
    expect(checkClaimQuote(caseWith(claim), claim)).toBe('found');
  });

  it('本文をあとから書き換えて、引用の原文が見つからない場合は notFound を返す', () => {
    const claim: Claim = { ...baseClaim, interviewId: videoInterview.id, quote: { text: 'あの夜は明かりがついていました' } };
    expect(checkClaimQuote(caseWith(claim), claim)).toBe('notFound');
  });

  it('聴取にひもづけていないか、聴取に本文が無い場合は、照合できないことを示す noTranscript を返す', () => {
    const withoutInterview: Claim = { ...baseClaim, interviewId: undefined, quote: { text: 'あの夜は別荘が真っ暗でした' } };
    const withBlankInterview: Claim = { ...baseClaim, interviewId: blankInterview.id, quote: { text: 'あの夜は別荘が真っ暗でした' } };
    expect(checkClaimQuote(caseWith(withoutInterview), withoutInterview)).toBe('noTranscript');
    expect(checkClaimQuote(caseWith(withBlankInterview), withBlankInterview)).toBe('noTranscript');
  });
});
