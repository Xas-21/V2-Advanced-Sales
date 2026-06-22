import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'RequestsManager.tsx'), 'utf8');
const agendaRenderSites = src.match(/&& renderAgendaSection\(\)\}/g) ?? [];

if (agendaRenderSites.length !== 1) {
    console.error(
        `Request Details must render Event agenda exactly once; found ${agendaRenderSites.length} render site(s).`
    );
    process.exit(1);
}

console.log('OK: Request Details has a single Event agenda section render site.');
