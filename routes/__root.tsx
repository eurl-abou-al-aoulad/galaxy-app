import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AppProvider } from "@/contexts/AppContext";
import { StarfieldBackground } from "@/components/galaxy/StarfieldBackground";
import { DevLockOverlay } from "@/components/security/DevLockOverlay";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md rounded-2xl p-8 text-center animate-cosmic-in">
        <h1 className="text-7xl font-bold text-gradient-galaxy">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-sm font-semibold text-primary-foreground neon-glow"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0b0b1f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "GALAXY" },
      { title: "THE GALAXY ACCOUNTING SOFTWARE" },
      { name: "description", content: "نظام كوني  لإدارة المبيعات والمخازن" },
      { property: "og:title", content: "THE GALAXY ACCOUNTING SOFTWARE" },
      { name: "twitter:title", content: "THE GALAXY ACCOUNTING SOFTWARE" },
      { property: "og:description", content: "نظام كوني  لإدارة المبيعات والمخازن" },
      { name: "twitter:description", content: "نظام كوني  لإدارة المبيعات والمخازن" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e4257f2f-7b16-4719-8ecc-d6b607ca1e2c/id-preview-83e953f8--a76bef20-9a5c-4708-8b55-484ac7257d10.lovable.app-1778023865810.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e4257f2f-7b16-4719-8ecc-d6b607ca1e2c/id-preview-83e953f8--a76bef20-9a5c-4708-8b55-484ac7257d10.lovable.app-1778023865810.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
      { rel: "icon", type: "image/png", href: "/icon-512.png" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;900&family=Aref+Ruqaa:wght@700&family=Nunito:wght@500;700;900&family=Caveat:wght@700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AppProvider>
      <StarfieldBackground />
      <Outlet />
      <Toaster position="top-center" richColors />
      <DevLockOverlay />
    </AppProvider>
  );
}
