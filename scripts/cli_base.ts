import { loadBaseUtils } from './common';

async function main() {
  await loadBaseUtils();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
