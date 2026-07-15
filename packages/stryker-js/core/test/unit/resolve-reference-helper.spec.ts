import { expect } from 'chai';

import { resolveProjectReferencePath } from '../../src/sandbox/resolve-reference-helper.js';

describe('resolveProjectReferencePath', () => {
  it('should return the path as-is when it already ends with .json', () => {
    const result = resolveProjectReferencePath({ path: './utils/tsconfig.json' });
    expect(result).to.equal('./utils/tsconfig.json');
  });

  it('should append tsconfig.json when the path does not end with .json', () => {
    const result = resolveProjectReferencePath({ path: './utils' });
    expect(result).to.equal('./utils/tsconfig.json');
  });

  it('should handle relative parent path', () => {
    const result = resolveProjectReferencePath({ path: '../shared' });
    expect(result).to.equal('../shared/tsconfig.json');
  });

  it('should handle absolute path', () => {
    const result = resolveProjectReferencePath({ path: '/absolute/path' });
    expect(result).to.equal('/absolute/path/tsconfig.json');
  });

  it('should handle bare tsconfig.json filename', () => {
    const result = resolveProjectReferencePath({ path: 'tsconfig.json' });
    expect(result).to.equal('tsconfig.json');
  });
});
