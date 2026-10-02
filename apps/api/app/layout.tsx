import { getLocale } from '@lib/i18n-server';
import { LanguageProvider } from '@lib/i18n-client';

export const metadata = {
  // TopDiggX is the user-facing brand. Default to the brand here so
  // client-component pages (scorer, analyze, dashboard) get a sensible
  // title without each having to export their own metadata.
  title: {
    default: 'TopDiggX',
    template: '%s · TopDiggX',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir="ltr">
      <body>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}