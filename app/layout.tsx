import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "UN Web TV Transcribed",
    description: "Browse UN Web TV videos with transcripts of all speeches",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                {children}
            </body>
        </html>
    );
}
