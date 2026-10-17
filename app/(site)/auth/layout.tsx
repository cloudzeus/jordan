import { Container } from '@/components/site/ui';

/** Φόρμες εισόδου: μία ήσυχη, κεντραρισμένη στήλη — τίποτα άλλο στη σελίδα. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="flex justify-center py-16 md:min-h-[calc(100dvh-112px)] md:items-center md:py-20">
      <div className="w-full max-w-[420px]">{children}</div>
    </Container>
  );
}
