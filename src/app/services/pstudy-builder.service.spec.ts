import Encoding from 'encoding-japanese';
import { PStudyBuilderService } from './pstudy-builder.service';

const COLUMNS =
  'a1,a2,a3,a4,a5,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,h1,h2,h3,h4,h5,h6,h7,h8,h9,h10,' +
  'd1,d2,d3,d4,d5,d6,d7,d8,d9,d10,wavfile,qvoicefile,imagefile,url';

/** 1〜4 行目 (問題集情報と列配置) */
const header = (title = 'pstudy_words') => `psscsvfile,100\r\n${title},,\r\n\r\n${COLUMNS}\r\n`;

/** 1 問分の行。a1 = 英単語, q1 = 訳, d1 = 例文, d2 = 発音記号, wavfile = 音声。空欄は引用符なし */
const row = (word: string, meaning: string, example = '', pron = '', wav = '') => {
  const values: Record<string, string> = { a1: word, q1: meaning, d1: example, d2: pron, wavfile: wav };
  return COLUMNS.split(',')
    .map((c) => (values[c] ? `"${values[c]}"` : ''))
    .join(',');
};

describe('PStudyBuilderService', () => {
  let service: PStudyBuilderService;

  beforeEach(() => {
    service = new PStudyBuilderService();
  });

  it('大文字小文字を無視して重複を弾く', () => {
    expect(service.addEntry('Apple', 'りんご')).toBe(true);
    expect(service.addEntry('apple', 'りんご')).toBe(false);
    expect(service.count()).toBe(1);
  });

  it('PSS 用 CSV の見出しを付け、a1 = 英単語, q1 = 訳 にする。引用符と改行も処理し、空欄は引用符なしにする', () => {
    service.addEntry('give up', '"やめる"\n諦める');
    expect(service.toCsv({ title: '単語帳' })).toBe(
      header('単語帳') + row('give up', '""やめる"" 諦める'),
    );
  });

  it('解説の d1 に例文、d2 に発音記号を出す', () => {
    service.addEntry('abandon', '捨てる', {
      example: 'Abandon ship! / 船を離れろ。',
      pronunciation: '/əbˈændən/',
    });
    expect(service.toCsv()).toBe(
      header() + row('abandon', '捨てる', 'Abandon ship! / 船を離れろ。', '/əbˈændən/'),
    );
  });

  it('例文と発音記号を編集できる', () => {
    service.addEntry('abandon', '捨てる');
    service.updateEntry(0, { example: 'ex', pronunciation: 'ph' });
    expect(service.entries()[0]).toEqual({
      word: 'abandon',
      meaning: '捨てる',
      example: 'ex',
      pronunciation: 'ph',
      audioUrl: '',
    });
  });

  it('wavfile に保存した音声ファイルのパスを出す', () => {
    service.addEntry('abandon', '捨てる', { audioUrl: 'https://cdn.weblio.jp/a.mp3' });
    service.addEntry('give up', 'やめる');
    expect(service.toCsv({ audioPaths: { abandon: 'C:\\voice\\abandon.mp3' } })).toBe(
      header() + row('abandon', '捨てる', '', '', 'C:\\voice\\abandon.mp3') + '\r\n' + row('give up', 'やめる'),
    );
  });

  it('Shift_JIS でエンコードする', async () => {
    service.addEntry('abandon', '捨てる');
    const bytes = new Uint8Array(await service.exportCsv().arrayBuffer());
    expect(Encoding.detect(bytes)).toBe('SJIS');
    expect(Encoding.convert(Array.from(bytes), { to: 'UNICODE', from: 'SJIS', type: 'string' })).toBe(
      header() + row('abandon', '捨てる'),
    );
  });

  it('UTF-8 でエンコードする', async () => {
    service.addEntry('abandon', '捨てる');
    const text = await service.exportCsv('UTF8').text();
    expect(text).toBe(header() + row('abandon', '捨てる'));
  });
});
