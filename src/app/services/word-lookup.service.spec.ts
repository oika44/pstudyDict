import { parseWeblioMeaning } from './word-lookup.service';

describe('parseWeblioMeaning', () => {
  it('meta description から訳を取り出す', () => {
    const html = `<html><head><meta name="description" content="「abandon」の意味・翻訳・日本語 - 捨てる、見捨てる、(中途で)やめる｜Weblio英和・和英辞書"></head></html>`;
    expect(parseWeblioMeaning(html)).toBe('捨てる、見捨てる、(中途で)やめる');
  });

  it('見つからないページでは空文字', () => {
    const html = `<html><head><meta name="description" content="qwzxの意味や使い方 - 約506万語ある英和辞典・和英辞典。"></head></html>`;
    expect(parseWeblioMeaning(html)).toBe('');
  });
});
