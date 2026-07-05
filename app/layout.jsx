import './globals.css';

export const metadata = {
  title: '東亞鐵路路線圖 | East Asia Railway Map',
  description: '香港、中國大陸、澳門、台灣、日本鐵路路線互動地圖',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
