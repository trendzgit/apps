import { build } from 'vite';

// Cross-platform equivalent of `SINGLE=1 vite build` (also works in Windows PowerShell/CMD).
process.env.SINGLE = '1';

try {
  await build();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
