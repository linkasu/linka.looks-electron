import chai from 'chai';
import { tts } from '@/utils/TTSServer';

const expect = chai.expect;

describe('tts function', () => {

  it('should return a buffer', async () => {
    const buffer = await tts('hello', 'alena');
    expect(buffer).instanceOf(ArrayBuffer);
    
  });

});
