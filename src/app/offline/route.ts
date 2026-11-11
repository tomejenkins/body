// Public, static, account-independent HTML. No layout, Auth or private reads.
export const dynamic = "force-static";
export function GET() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <meta name="color-scheme" content="light dark" />
    <title>Body · Connection unavailable</title>
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        font:
          1rem/1.6 system-ui,
          sans-serif;
        background: #f8f9f7;
        color: #19251d;
      }
      main {
        max-width: 28rem;
        padding: max(2rem, env(safe-area-inset-top)) 1.5rem;
      }
      h1 {
        font-size: 2.5rem;
        letter-spacing: -0.05em;
      }
      p {
        color: #536257;
      }
      a {
        display: inline-block;
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        background: #325b44;
        color: white;
        text-decoration: none;
      }
      a:focus-visible {
        outline: 3px solid #779e85;
        outline-offset: 4px;
      }
      @media (prefers-color-scheme: dark) {
        body {
          background: #111612;
          color: #f0f4ef;
        }
        p {
          color: #b7c4ba;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>body.</h1>
      <h2>Connection unavailable</h2>
      <p>
        Reconnect to open this page. If your workout is still open in another
        tab, keep it open until your changes are confirmed saved.
      </p>
      <p>
        This screen contains no workout data. Unconfirmed changes are not saved.
      </p>
      <a href="">Try again</a>
    </main>
  </body>
</html>
`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      },
    },
  );
}
