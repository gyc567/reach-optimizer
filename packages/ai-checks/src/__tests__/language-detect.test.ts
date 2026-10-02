import { describe, it, expect } from 'vitest';
import { detectLanguage, getLanguageInstruction, getLanguageName } from '../language-detect';

describe('detectLanguage — Turkish', () => {
  it('detects from special characters', () => {
    expect(detectLanguage('Bu ürün çok güzel değil mi?')).toBe('tr');
    expect(detectLanguage('İstanbul çok güzel bir şehir')).toBe('tr');
    expect(detectLanguage('Türkiye ekonomisi hakkında görüşler')).toBe('tr');
  });

  it('detects from common words', () => {
    expect(detectLanguage('Ben bir test yazdim ve sonuc iyi')).toBe('tr');
    expect(detectLanguage('Bu konuda daha fazla bilgi var mi')).toBe('tr');
  });

  it('handles mixed content — Turkish chars win', () => {
    expect(detectLanguage('React ile güzel bir component yazdım')).toBe('tr');
  });
});

describe('detectLanguage — English (Latin fallback)', () => {
  it('detects English', () => {
    expect(detectLanguage('This is a test tweet about technology')).toBe('en');
    expect(detectLanguage('The most important thing about startups is speed')).toBe('en');
    expect(detectLanguage('Just shipped a new feature to production')).toBe('en');
  });
});

describe('detectLanguage — Chinese (NEW)', () => {
  it('detects Chinese from Han characters', () => {
    expect(detectLanguage('突发：全球债务现已超过365万亿美元')).toBe('zh');
    expect(detectLanguage('你好世界，这是中文测试')).toBe('zh');
    expect(detectLanguage('今天天气真好，我想去公园散步。')).toBe('zh');
  });

  it('detects Chinese with punctuation', () => {
    expect(detectLanguage('我他妈的到底欠谁的钱？？')).toBe('zh');
    expect(detectLanguage('中国GDP增长率为5.2%，这是一个好消息。')).toBe('zh');
  });

  it('handles Chinese + Latin mix as Chinese (Han dominates)', () => {
    expect(detectLanguage('我去过 Tokyo 和 Osaka')).toBe('zh');
    expect(detectLanguage('GDP增长 365 万亿 US$')).toBe('zh');
  });
});

describe('detectLanguage — Japanese (NEW)', () => {
  it('detects Japanese from Hiragana/Katakana', () => {
    expect(detectLanguage('こんにちは世界')).toBe('ja');
    expect(detectLanguage('カタカナテストです')).toBe('ja');
    expect(detectLanguage('ひらがなだけ')).toBe('ja');
  });

  it('handles mixed Kanji + Kana as Japanese (not Chinese)', () => {
    expect(detectLanguage('日本語の漢字テスト')).toBe('ja');
    expect(detectLanguage('東京の天気は晴れです')).toBe('ja');
  });
});

describe('detectLanguage — Korean (NEW)', () => {
  it('detects Korean from Hangul', () => {
    expect(detectLanguage('안녕하세요 세계')).toBe('ko');
    expect(detectLanguage('한국의 한자 사용')).toBe('ko');
  });

  it('handles Hanja + Hangul mix as Korean', () => {
    expect(detectLanguage('한국의 한자')).toBe('ko');
  });
});

describe('detectLanguage — Cyrillic / Arabic / Devanagari', () => {
  it('detects Russian from Cyrillic', () => {
    expect(detectLanguage('Привет мир, это тест')).toBe('ru');
    expect(detectLanguage('Россия — большая страна')).toBe('ru');
  });

  it('detects Arabic', () => {
    expect(detectLanguage('مرحبا بالعالم')).toBe('ar');
    expect(detectLanguage('السلام عليكم')).toBe('ar');
  });

  it('detects Hindi from Devanagari', () => {
    expect(detectLanguage('नमस्ते दुनिया')).toBe('hi');
    expect(detectLanguage('भारत महान देश है')).toBe('hi');
  });
});

describe('detectLanguage — Other Latin languages', () => {
  it('detects Spanish from ñ/¿', () => {
    expect(detectLanguage('Hola, ¿cómo estás?')).toBe('es');
    expect(detectLanguage('España es un país hermoso')).toBe('es');
  });

  it('detects German from ä/ö/ü/ß', () => {
    expect(detectLanguage('Schöne Grüße aus Berlin')).toBe('de');
    expect(detectLanguage('Das ist großartig!')).toBe('de');
  });

  it('detects French from accents', () => {
    expect(detectLanguage('Bonjour, ça va bien?')).toBe('fr');
    expect(detectLanguage('Très élégant aujourd\'hui')).toBe('fr');
  });

  it('detects Portuguese from ã/õ', () => {
    expect(detectLanguage('Olá, como você está?')).toBe('pt');
    expect(detectLanguage('São Paulo é grande')).toBe('pt');
  });
});

describe('detectLanguage — Edge cases', () => {
  it('returns other for empty / short text', () => {
    expect(detectLanguage('')).toBe('other');
    expect(detectLanguage('hi')).toBe('other');
    expect(detectLanguage('ab')).toBe('other');
  });

  it('returns other for emoji-only text', () => {
    expect(detectLanguage('🚀🎉🔥')).toBe('other');
  });

  it('returns other for digits / punctuation only', () => {
    expect(detectLanguage('100%')).toBe('other');
    expect(detectLanguage('!!!')).toBe('other');
  });
});

describe('getLanguageInstruction', () => {
  it('emits CRITICAL: write in [lang] for each language', () => {
    const zh = getLanguageInstruction('zh');
    expect(zh).toContain('Chinese');
    expect(zh).toContain('中文');
    expect(zh).toContain('CRITICAL');
    expect(zh).toContain('Do NOT translate');

    const ja = getLanguageInstruction('ja');
    expect(ja).toContain('Japanese');
    expect(ja).toContain('日本語');

    const ru = getLanguageInstruction('ru');
    expect(ru).toContain('Russian');

    const ar = getLanguageInstruction('ar');
    expect(ar).toContain('Arabic');
    expect(ar).toContain('العربية');
  });

  it('emits "preserve original" for other/ambiguous', () => {
    const o = getLanguageInstruction('other');
    expect(o).toContain('SAME LANGUAGE');
    expect(o).toContain('Do NOT translate');
  });
});

describe('getLanguageName', () => {
  it('returns native-script label for each language', () => {
    expect(getLanguageName('zh')).toBe('Chinese (中文)');
    expect(getLanguageName('ja')).toBe('Japanese (日本語)');
    expect(getLanguageName('ko')).toBe('Korean (한국어)');
    expect(getLanguageName('tr')).toBe('Turkish (Türkçe)');
    expect(getLanguageName('en')).toBe('English');
    expect(getLanguageName('es')).toBe('Spanish (Español)');
  });

  it('returns fallback for other', () => {
    expect(getLanguageName('other')).toContain('SAME LANGUAGE');
  });
});