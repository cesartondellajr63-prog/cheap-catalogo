import type { Metadata } from 'next'
import { Syne, Inter } from 'next/font/google'
import '@/styles/globals.css'

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  variable: '--font-syne',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Cheaps Pods — Catálogo',
  description: 'Os melhores pods com os melhores preços. Ignite, Elf Bar, Lost Mary, Oxbar e Black Sheep.',
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${syne.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
