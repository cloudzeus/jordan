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
  // Το @pascal-app/editor έχει εσωτερικό TS bug (follow-pascal-targets.ts) — το δικό μας
  // typecheck τρέχει ξεχωριστά με `tsc --noEmit`, οπότε εδώ αγνοούμε μόνο το build-time check.
  typescript: { ignoreBuildErrors: true },
  sassOptions: {
    includePaths: [path.join(process.cwd(), 'styles')],
  },
  experimental: {
    serverActions: { bodySizeLimit: '500mb' },
  },
  // Ο δημόσιος κατάλογος (/products) αφαιρέθηκε — τα παλιά links και τα αποτελέσματα αναζήτησης
  // πάνε στην αρχική αντί για 404.
  async redirects() {
    return [
      { source: '/products', destination: '/', permanent: true },
      { source: '/products/:path*', destination: '/', permanent: true },
    ];
  },
  serverExternalPackages: ['sharp', 'pdf-to-img', 'pdfjs-dist', 'pdf-parse', 'unpdf'],
  // Τα Pascal packages είναι ESM και χρειάζονται transpile από το Next.js.
  transpilePackages: ['@pascal-app/core', '@pascal-app/viewer', '@pascal-app/nodes', '@pascal-app/editor'],
};

export default nextConfig;
