import type { Metadata } from 'next';
import './globals.css';
import './touch.css';
import './home-menu.css';

export const metadata: Metadata = {
  title: '神速 GODSPEED · 神话竞速',
  description: '翼靴、风火轮与灯烟。穿过坡道、竖环与高轨，只与时间赛跑。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
