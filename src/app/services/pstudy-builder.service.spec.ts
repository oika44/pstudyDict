import Encoding from 'encoding-japanese';
import { PStudyBuilderService } from './pstudy-builder.service';

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

  it('「問題,解答」形式の CSV を作り、引用符と改行を処理する', () => {
    service.addEntry('give up', '"やめる"\n諦める');
    expect(service.toCsv()).toBe('"give up","""やめる"" 諦める"');
  });

  it('Shift_JIS でエンコードする', async () => {
    service.addEntry('abandon', '捨てる');
    const bytes = new Uint8Array(await service.exportCsv().arrayBuffer());
    expect(Encoding.detect(bytes)).toBe('SJIS');
    expect(Encoding.convert(Array.from(bytes), { to: 'UNICODE', from: 'SJIS', type: 'string' })).toBe(
      '"abandon","捨てる"',
    );
  });

  it('UTF-8 でエンコードする', async () => {
    service.addEntry('abandon', '捨てる');
    const text = await service.exportCsv('UTF8').text();
    expect(text).toBe('"abandon","捨てる"');
  });
});
