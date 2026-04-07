import CatalogClient from '@/components/catalog/CatalogClient';

export const metadata = {
  title: 'Cheap Pods — Catálogo',
  description: 'Os melhores pods com os melhores preços. Ignite, Elf Bar, Lost Mary, Oxbar e Black Sheep.',
};

export default function HomePage() {
  return <CatalogClient />;
}
