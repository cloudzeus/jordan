import path from 'path';

// Ρίζα = ΑΥΤΟΣ ο φάκελος. Ο γονικός /Volumes/EXTERNALSSD/PROJECTS έχει δικό του package-lock.json, οπότε
// το Next τον έπαιρνε για workspace root και παρακολουθούσε ΟΛΑ τα projects εκεί (motion-studio renders,
// builds άλλων projects) ⇒ ατελείωτα rebuilds/reloads του dev server.
const projectRoot = path.dirname(new URL(import.meta.url).pathname);

const nextConfig = {
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  output: 'standalone',
  reactStrictMode: true,
  // Types are clean (verified via `tsc --noEmit`), so the build enforces them.
  // ESLint is intentionally not run during the production build — lint belongs
  // in CI, and `next build` would otherwise fail on lint errors.
  eslint: { ignoreDuringBuilds: true },
  sassOptions: {
    includePaths: [path.join(process.cwd(), 'styles')],
  },
  experimental: {
    serverActions: { bodySizeLimit: '500mb' },
  },
  serverExternalPackages: ['sharp', 'pdf-to-img', 'pdfjs-dist', 'pdf-parse', 'unpdf'],
};

export default nextConfig;
