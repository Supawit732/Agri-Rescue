import { buildRipenessPrompt } from '../../src/ai/vision';
import { crops } from '../../src/db/seedData';

describe('buildRipenessPrompt features', () => {
  it('includes normal and defect feature lists for the crop', () => {
    const banana = crops.find((c) => c.key === 'banana');
    expect(banana).toBeDefined();
    const prompt = buildRipenessPrompt(banana!.nameTh, {
      normalFeaturesTh: banana!.normalFeaturesTh,
      defectExamplesTh: banana!.defectExamplesTh,
    });
    expect(prompt).toContain(banana!.normalFeaturesTh);
    expect(prompt).toContain(banana!.defectExamplesTh);
    expect(prompt).toContain('ห้ามนับลักษณะปกติเป็นตำหนิ');
    expect(prompt).toContain('กล้วยน้ำว้า');
  });
});
