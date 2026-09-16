import './globals.css';
export const metadata = {
  title: 'The Watch · marktan.ai',
  description: 'Private camera recordings at marktan.ai.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }) {
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,800;1,9..144,500&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  </head><body><div className="accent-bar" />{children}</body></html>;
}
