// @vitest-environment node
/**
 * 記事のページの HTML から、本文（プレーンテキスト）・題名・公開日時を取り出す処理のテスト
 */
import { describe, expect, it } from 'vitest';
import { ArticleFetchError } from './article-download';
import { extractArticle } from './article-extraction';

/** 本文の段落です。本文として取り出されるよう、ある程度の長さを持たせています。 */
const paragraphs = [
  '13日午前2時ごろ、湖畔の別荘から火が出ていると、近くに住む男性から119番通報があった。消防車10台が出て、火はおよそ3時間後に消し止められたが、木造2階建ての別荘はほぼ全焼した。',
  '警察によると、焼け跡から人は見つかっていない。別荘の管理人は「12日の夜は別荘が真っ暗で、車もありませんでした」と話しているという。警察と消防は、出火の原因を詳しく調べている。',
  '近くに住む女性は「夜中に焦げたにおいがして外に出ると、別荘の窓から炎が上がっていた。こんなことは初めてで、本当に驚いた」と話した。現場は湖の北側の、別荘が点在する地域。',
];

/** メニュー・広告・関連記事に囲まれた、ニュースサイトの記事のページです。 */
const newsPageHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>湖畔の別荘で火事、けが人なし | 湖畔新聞</title>
  <meta property="og:title" content="湖畔の別荘で火事、けが人なし">
  <meta property="article:published_time" content="1998-08-13T06:30:00+09:00">
</head>
<body>
  <header><nav><ul><li><a href="/">トップ</a></li><li><a href="/national">社会</a></li><li><a href="/sports">スポーツ</a></li></ul></nav></header>
  <div class="ad">広告：湖畔のリゾートホテル、今なら半額</div>
  <main>
    <article>
      <h1>湖畔の別荘で火事、けが人なし</h1>
      <p>${paragraphs[0]}</p>
      <p>${paragraphs[1]!.replace('「12日の夜は', '<strong>「12日の夜は</strong>')}</p>
      <p>
        ${paragraphs[2]}
      </p>
    </article>
  </main>
  <aside><h2>関連記事</h2><ul><li><a href="/a">湖のボートが転覆</a></li><li><a href="/b">別荘地で停電</a></li></ul></aside>
  <footer>Copyright 湖畔新聞社</footer>
</body>
</html>`;

describe('extractArticle', () => {
  it('メニュー・広告・関連記事を除いた本文（見出しを含む）を、段落ごとに改行で区切ったプレーンテキストで返す', () => {
    const article = extractArticle(newsPageHtml, 'https://news.example.com/kohan');

    expect(article.text).toBe(['湖畔の別荘で火事、けが人なし', ...paragraphs].join('\n'));
  });

  it('記事の題名と、公開日時（記事の現地時刻の年月日と時分）を返す', () => {
    const article = extractArticle(newsPageHtml, 'https://news.example.com/kohan');

    expect(article.title).toBe('湖畔の別荘で火事、けが人なし');
    expect(article.publishedAt).toBe('1998-08-13T06:30');
  });

  it('改行（br）は本文の改行として残し、連続する空白は1つにまとめる', () => {
    const html = `<html><body><article><p>${paragraphs[0]}<br>${paragraphs[1]}</p><p>管理人は   「車も\n   ありませんでした」と話した。${paragraphs[2]}</p></article></body></html>`;

    const article = extractArticle(html, 'https://news.example.com/kohan');

    expect(article.text).toBe([paragraphs[0], paragraphs[1], `管理人は 「車も ありませんでした」と話した。${paragraphs[2]}`].join('\n'));
  });

  it('公開日時が日付だけの場合は、日付だけを返す', () => {
    const html = newsPageHtml.replace('1998-08-13T06:30:00+09:00', '1998-08-13');

    expect(extractArticle(html, 'https://news.example.com/kohan').publishedAt).toBe('1998-08-13');
  });

  it('公開日時が無い場合は、公開日時を返さない', () => {
    const html = newsPageHtml.replace(/<meta property="article:published_time"[^>]*>/, '');

    expect(extractArticle(html, 'https://news.example.com/kohan').publishedAt).toBeUndefined();
  });

  it('本文を取り出せないページは、理由を示して拒否する', () => {
    expect(() => extractArticle('<html><head><title>空のページ</title></head><body></body></html>', 'https://news.example.com/empty')).toThrow(
      new ArticleFetchError(422, '記事の本文を取り出せませんでした。ページを開いて本文を貼り付けてください。')
    );
  });
});
