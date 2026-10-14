import {
  parseWeblioAudioUrl,
  parseWeblioExample,
  parseWeblioMeaning,
  parseWeblioPronunciation,
} from './word-lookup.service';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('parseWeblioMeaning', () => {
  it('meta description から訳を取り出す', () => {
    const html = `<html><head><meta name="description" content="「abandon」の意味・翻訳・日本語 - 捨てる、見捨てる、(中途で)やめる｜Weblio英和・和英辞書"></head></html>`;
    expect(parseWeblioMeaning(parse(html))).toBe('捨てる、見捨てる、(中途で)やめる');
  });

  it('見つからないページでは空文字', () => {
    const html = `<html><head><meta name="description" content="qwzxの意味や使い方 - 約506万語ある英和辞典・和英辞典。"></head></html>`;
    expect(parseWeblioMeaning(parse(html))).toBe('');
  });
});

describe('parseWeblioPronunciation', () => {
  it('米国・英国の発音記号をスラッシュで囲んで並べる', () => {
    const html = `<div class=phoneticEjjeWrp><span class=phoneticEjjeSym>/</span><span class=phoneticEjjeDesc>əbˈændən</span><span class=phoneticEjjeDc>(米国英語)</span>, <span class=phoneticEjjeDesc>əˈbændən</span><span class=phoneticEjjeDc>(英国英語)</span><span class=phoneticEjjeSym>/</span></div>`;
    expect(parseWeblioPronunciation(parse(html))).toBe('/əbˈændən/ /əˈbændən/');
  });

  it('発音記号がなければ空文字', () => {
    expect(parseWeblioPronunciation(parse('<p>give up</p>'))).toBe('');
  });
});

describe('parseWeblioExample', () => {
  it('先頭の例文を「英文 / 和訳」にし、音声ボタンや出典を除く', () => {
    const html = `
      <div class="qotC">
        <p class="qotCE">
          <b>Abandon</b> <a href="#">ship</a>!<b class="squareCircle">発音を聞く</b>
          <i class="fa fa-volume-up"><audio></audio></i>
          <span class=addToSlBtnCntner><a class=addToSlBtn>例文帳に追加</a></span>
        </p>
        <p class="qotCJ">船を離れろ。<span>&nbsp;-&nbsp;Tanaka Corpus</span></p>
      </div>
      <div class="qotC"><p class="qotCE">second</p><p class="qotCJ">二番目</p></div>`;
    expect(parseWeblioExample(parse(html))).toBe('Abandon ship! / 船を離れろ。');
  });

  it('例文がなければ空文字', () => {
    expect(parseWeblioExample(parse('<p>none</p>'))).toBe('');
  });
});

describe('parseWeblioAudioUrl', () => {
  it('ページ上部の音声ボタンから単語の MP3 の URL を取り出す', () => {
    const html = `
      <i class="fa fa-volume-up contentTopAudioIcon">
        <audio class="contentAudio"><source src="https://cdn.weblio.jp/e7/img/dict/kenej/audio/S-9AF5800_E-9AF7FD0.mp3" type="audio/mpeg"></audio>
      </i>
      <i class="sentenceAudioIcon"><audio><source src="https://cdn.weblio.jp/e8/audio/x.mp3"></audio></i>`;
    expect(parseWeblioAudioUrl(parse(html))).toBe(
      'https://cdn.weblio.jp/e7/img/dict/kenej/audio/S-9AF5800_E-9AF7FD0.mp3',
    );
  });

  it('音声ボタンがなければ空文字', () => {
    const html = `<i class="sentenceAudioIcon"><audio><source src="https://cdn.weblio.jp/e8/audio/x.mp3"></audio></i>`;
    expect(parseWeblioAudioUrl(parse(html))).toBe('');
  });
});
