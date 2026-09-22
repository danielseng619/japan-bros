import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.json']) {
  await copyFile(file, `public/${file}`);
}
