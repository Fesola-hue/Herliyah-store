import Link from "next/link";

export default async function AdminPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#fff0d6",
        color: "#171810",
      }}
    >
      <section
        style={{
          maxWidth: "42rem",
          border: "1px solid #171810",
          padding: "clamp(1.5rem,5vw,3rem)",
          background: "#fffaf0",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: ".14em",
            fontSize: ".75rem",
            color: "#59620f",
          }}
        >
          Owner workspace
        </p>
        <h1
          style={{
            fontFamily: "Georgia,serif",
            fontWeight: 400,
            fontSize: "clamp(2.5rem,7vw,4.5rem)",
            lineHeight: 1,
            margin: ".5rem 0 1rem",
          }}
        >
          Admin access is locked.
        </h1>
        <p>
          The independent deployment will use Cloudflare Access with a verified
          JWT and an explicit owner email allowlist. The dashboard remains
          unavailable until those settings and the owner identity are
          configured.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: "1rem",
            textDecoration: "underline",
          }}
        >
          Return to the storefront
        </Link>
      </section>
    </main>
  );
}
