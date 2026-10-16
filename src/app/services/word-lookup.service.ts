import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

export interface DictionaryResult {
  word: string;
  meaning: string;
  /** 例文 (英文 / 和訳)。なければ空文字 */
  example: string;
  /** 発音記号。なければ空文字 */
  pronunciation: string;
  /** 単語の発音の音声ファイル (MP3) の URL。なければ空文字 */
  audioUrl: string;
}

/** 単語が辞書に存在しなかったときのエラー */
export class WordNotFoundError extends Error {
  constructor(word: string) {
    super(`「${word}」は見つかりませんでした`);
  }
}

/**
 * Weblio 英和辞書で英単語の日本語訳を調べる。
 * CORS 回避のため、開発サーバのプロキシ (/weblio → https://ejje.weblio.jp/content) 経由で取得する。
 */
@Injectable({
  providedIn: 'root',
})
export class WordLookupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/weblio/';

  lookup(word: string): Observable<DictionaryResult> {
    const w = word.trim();
    return this.http.get(this.apiBase + encodeURIComponent(w), { responseType: 'text' }).pipe(
      map((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const meaning = parseWeblioMeaning(doc);
        if (!meaning) throw new WordNotFoundError(w);
        return {
          word: w,
          meaning,
          example: parseWeblioExample(doc),
          pronunciation: parseWeblioPronunciation(doc),
          audioUrl: parseWeblioAudioUrl(doc),
        };
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return throwError(() => new WordNotFoundError(w));
        }
        return throwError(() => err);
      }),
    );
  }
}

/**
 * Weblio のページから要約された日本語訳を取り出す。
 * meta description が「「abandon」の意味・翻訳・日本語 - 捨てる、見捨てる…｜Weblio英和・和英辞書」
 * という形式なので、「 - 」と「｜」の間を使う。
 */
export function parseWeblioMeaning(doc: Document): string {
  const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  const m = desc.match(/の意味・翻訳・日本語 - (.+?)｜/);
  if (m) return m[1].trim();

  // meta が想定外の形式だった場合は本文の要約欄を使う
  return doc.querySelector('.content-explanation')?.textContent?.trim() ?? '';
}

/**
 * 発音記号を「/米/ /英/」の形で取り出す。
 * ページ上部の <span class=phoneticEjjeDesc>əbˈændən</span> を使う。熟語などでは無いことが多い。
 */
export function parseWeblioPronunciation(doc: Document): string {
  return Array.from(doc.querySelectorAll('.phoneticEjjeWrp .phoneticEjjeDesc'))
    .map((e) => e.textContent?.trim())
    .filter((p) => !!p)
    .map((p) => `/${p}/`)
    .join(' ');
}

/**
 * ページ上部の音声ボタンにある単語の発音の MP3 の URL を取り出す。
 * 例文の音声 (.sentenceAudio) は対象外。
 */
export function parseWeblioAudioUrl(doc: Document): string {
  const src = doc.querySelector('.contentTopAudioIcon source')?.getAttribute('src') ?? '';
  return src.startsWith('https://cdn.weblio.jp/') ? src : '';
}

/**
 * 例文欄の先頭の 1 件を「英文 / 和訳」の形で取り出す。
 * 英文は .qotCE、和訳は同じ .qotC 内の .qotCJ にあり、音声ボタンや出典などの付属物は取り除く。
 */
export function parseWeblioExample(doc: Document): string {
  const item = doc.querySelector('.qotC .qotCE')?.closest('.qotC');
  if (!item) return '';
  const en = textWithout(item.querySelector('.qotCE'), 'b.squareCircle, i, .addToSlBtnCntner');
  const ja = textWithout(item.querySelector('.qotCJ'), 'span');
  return [en, ja].filter((t) => t).join(' / ');
}

function textWithout(el: Element | null, removeSelector: string): string {
  if (!el) return '';
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(removeSelector).forEach((e) => e.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}
