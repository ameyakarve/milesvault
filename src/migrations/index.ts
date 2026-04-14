import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260414_183426 from './20260414_183426';
import * as migration_20260414_190928 from './20260414_190928';
import * as migration_20260414_200040 from './20260414_200040';
import * as migration_20260414_201202 from './20260414_201202';
import * as migration_20260414_202218 from './20260414_202218';
import * as migration_20260414_203347 from './20260414_203347';

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260414_183426.up,
    down: migration_20260414_183426.down,
    name: '20260414_183426',
  },
  {
    up: migration_20260414_190928.up,
    down: migration_20260414_190928.down,
    name: '20260414_190928',
  },
  {
    up: migration_20260414_200040.up,
    down: migration_20260414_200040.down,
    name: '20260414_200040',
  },
  {
    up: migration_20260414_201202.up,
    down: migration_20260414_201202.down,
    name: '20260414_201202',
  },
  {
    up: migration_20260414_202218.up,
    down: migration_20260414_202218.down,
    name: '20260414_202218',
  },
  {
    up: migration_20260414_203347.up,
    down: migration_20260414_203347.down,
    name: '20260414_203347'
  },
];
