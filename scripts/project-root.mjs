import path from 'node:path';

export const root = path.resolve(process.env.LEAVE_SYSTEM_ROOT || process.cwd());
