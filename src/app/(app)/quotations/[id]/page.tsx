
import { QuotationPageClient } from './QuotationPageClient';

export default function QuotationDetailsPage({ params }: { params: { id: string } }) {
  // This is now a clean Server Component. The actual logic is in the client component.
  return <QuotationPageClient requisitionId={params.id} />;
}
