"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the deployed Vinext Link runtime failure. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import {
  Heart,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { formatNaira, type CartItem, type Product } from "@/lib/catalog";

const CART_KEY = "herliyah-preview-cart-v1",
  WISH_KEY = "herliyah-preview-wishlist-v1",
  CHECKOUT_KEY = "herliyah-preview-checkout-v1",
  CHECKOUT_SESSION_KEY = "herliyah-checkout-session-v1",
  CUSTOMER_CONNECTED_KEY = "herliyah-customer-connected-v1";
const EMPTY_CART: CartItem[] = [];
const EMPTY_WISHLIST: string[] = [];
const EMPTY_CHECKOUT_SESSION: { idempotencyKey: string } = {
  idempotencyKey: "",
};
function useStored<T>(key: string, initial: T) {
  const fallback = useMemo(() => JSON.stringify(initial), [initial]);
  const subscribe = useCallback(
    (notify: () => void) => {
      const listener = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) notify();
      };
      window.addEventListener("herliyah-storage", listener);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener("herliyah-storage", listener);
        window.removeEventListener("storage", notify);
      };
    },
    [key],
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? fallback,
    () => fallback,
  );
  const value = useMemo(() => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [raw, initial]);
  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const currentRaw = localStorage.getItem(key) ?? fallback;
      let current: T;
      try {
        current = JSON.parse(currentRaw) as T;
      } catch {
        current = initial;
      }
      const resolved =
        typeof next === "function"
          ? (next as (current: T) => T)(current)
          : next;
      localStorage.setItem(key, JSON.stringify(resolved));
      window.dispatchEvent(
        new CustomEvent("herliyah-storage", { detail: key }),
      );
    },
    [fallback, initial, key],
  );
  return [value, setValue] as const;
}
const CatalogContext = createContext<Product[]>([]);
const useCatalog = () => useContext(CatalogContext);
function useScrollReveal() {
  useEffect(() => {
    const elements =
      document.querySelectorAll<HTMLElement>(".reveal-on-scroll");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8%" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}
function useParallaxImages() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const images = document.querySelectorAll<HTMLElement>(".parallax-image");
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewportCenter = window.innerHeight / 2;
      images.forEach((image) => {
        const bounds = image.parentElement?.getBoundingClientRect();
        if (
          !bounds ||
          bounds.bottom < -80 ||
          bounds.top > window.innerHeight + 80
        )
          return;
        const distance =
          (viewportCenter - (bounds.top + bounds.height / 2)) * 0.045;
        const offset = Math.max(-24, Math.min(24, distance));
        image.style.setProperty("--parallax-offset", `${offset.toFixed(1)}px`);
      });
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
const Brand = () => (
  <a className="wordmark" href="/" aria-label="HERLIYAH home">
    HERLIYAH
  </a>
);

function Header({ count }: { count: number }) {
  const [open, setOpen] = useState(false),
    [menuClosing, setMenuClosing] = useState(false);
  const closeMenu = () => {
    setMenuClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setMenuClosing(false);
    }, 220);
  };
  return (
    <>
      <div className="preview-notice">
        Preview · sample products & prices · no live payments
      </div>
      <header className="site-header">
        <button
          className="icon-button mobile-only"
          onClick={() => {
            setMenuClosing(false);
            setOpen(true);
          }}
          aria-label="Open menu"
        >
          <Menu />
        </button>
        <nav className="desktop-nav">
          <a href="/shop">Shop</a>
          <a href="/track">Track order</a>
        </nav>
        <Brand />
        <nav className="header-actions">
          <a className="desktop-only" href="/wishlist" aria-label="Wishlist">
            <Heart />
          </a>
          <a className="desktop-only" href="/account" aria-label="Account">
            <UserRound />
          </a>
          <a href="/cart" aria-label={`Bag with ${count} items`}>
            <ShoppingBag />
            <span>{count}</span>
          </a>
        </nav>
      </header>
      {open && (
        <div
          className={`mobile-menu ${menuClosing ? "is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="icon-button close-menu"
            onClick={closeMenu}
            aria-label="Close menu"
          >
            <X />
          </button>
          <Brand />
          <nav onClick={closeMenu}>
            <a href="/shop">Shop the collection</a>
            <a href="/wishlist">Wishlist</a>
            <a href="/track">Track an order</a>
            <a href="/account">Account preview</a>
            <a href="/admin">Owner dashboard</a>
          </nav>
        </div>
      )}
    </>
  );
}
function Footer() {
  return (
    <footer className="footer">
      <div>
        <Brand />
        <p>Considered clothing, prepared to order.</p>
      </div>
      <div>
        <h3>Visit</h3>
        <a href="/shop">Shop</a>
        <a href="/track">Order tracking</a>
        <a href="/admin">Owner access</a>
      </div>
      <div>
        <h3>Policies</h3>
        <span>Delivery · owner review needed</span>
        <span>Returns · owner review needed</span>
        <span>Privacy & terms · owner review needed</span>
      </div>
      <p className="footer-note">
        Development preview. Nothing shown is available for purchase.
      </p>
    </footer>
  );
}

function ProductCard({
  p,
  wish,
  toggle,
  returnTo,
}: {
  p: Product;
  wish: string[];
  toggle: (id: string) => void;
  returnTo?: string;
}) {
  const saved = wish.includes(p.id),
    [feedback, setFeedback] = useState("");
  const showFeedback = (next: string) => {
    setFeedback(next);
    window.setTimeout(() => setFeedback(""), 1400);
  };
  const href = `/product/${p.slug}${returnTo ? `?from=${encodeURIComponent(returnTo)}` : ""}`;
  return (
    <article className="product-card">
      <div className="product-image-wrap">
        <a href={href}>
          <img
            src={p.image}
            alt={p.images[0]?.alt ?? `Sample photograph for ${p.name}`}
            loading="lazy"
          />
        </a>
        <button
          className={`heart ${saved ? "saved" : ""}`}
          onClick={() => {
            toggle(p.id);
            showFeedback(saved ? "Removed" : "Saved");
          }}
          aria-label={
            saved
              ? `Remove ${p.name} from wishlist`
              : `Save ${p.name} to wishlist`
          }
        >
          <Heart fill={saved ? "currentColor" : "none"} />
        </button>
        {feedback && (
          <span className="heart-feedback" role="status">
            {feedback}
          </span>
        )}
        {p.sample && <span className="sample-pill">Sample</span>}
      </div>
      <div className="product-card-copy">
        <div>
          <h3>
            <a href={href}>{p.name}</a>
          </h3>
          <p>{p.accent}</p>
        </div>
        <div className="price">
          {formatNaira(p.priceKobo)}
          {p.sample && <small>sample price</small>}
        </div>
      </div>
      <p className="lead-time">
        Preorder · {p.preparation.min}–{p.preparation.max} business days to
        dispatch
      </p>
    </article>
  );
}
function ProductGrid({
  items,
  wish,
  toggle,
  returnTo,
}: {
  items: Product[];
  wish: string[];
  toggle: (id: string) => void;
  returnTo?: string;
}) {
  return (
    <div className="product-grid">
      {items.map((p) => (
        <ProductCard
          key={p.id}
          p={p}
          wish={wish}
          toggle={toggle}
          returnTo={returnTo}
        />
      ))}
    </div>
  );
}

function Home({
  wish,
  toggle,
}: {
  wish: string[];
  toggle: (id: string) => void;
}) {
  useScrollReveal();
  useParallaxImages();
  const featuredProducts = useCatalog().slice(0, 4);
  return (
    <main>
      <section className="hero">
        <div className="hero-image">
          <img
            className="parallax-image"
            src="/hero-cream.png"
            alt="Sample editorial photograph of a woman in a cream draped dress"
            fetchPriority="high"
          />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">The first study</p>
          <h1>Clothes with presence</h1>
          <a className="button" href="/shop">
            Shop collection
          </a>
        </div>
      </section>
      <section className="principles reveal-on-scroll">
        <span>Made after you order</span>
        <p>
          A study in proportion, restraint and ease. Every piece is prepared to
          order, with its preparation window shown before checkout. Courier
          delivery begins only after dispatch.
        </p>
      </section>
      <section className="collection-section reveal-on-scroll">
        <div className="section-heading">
          <p className="eyebrow">Sample collection</p>
          <h2>Quietly commanding.</h2>
          <a href="/shop">Shop all</a>
        </div>
        <ProductGrid items={featuredProducts} wish={wish} toggle={toggle} />
      </section>
      <section className="story reveal-on-scroll">
        <img
          className="parallax-image"
          src="/look-olive.png"
          alt="Sample editorial photograph of a woman in an olive tailored set"
          loading="lazy"
        />
        <div className="story-image-copy">
          <p className="eyebrow">The silhouette</p>
          <h2>Cut for the way you hold a room.</h2>
          <p>
            Intentional lines, considered proportions and an unhurried ease.
          </p>
          <a className="text-link" href="/shop">
            Shop collection
          </a>
        </div>
      </section>
    </main>
  );
}

function Shop({
  wish,
  toggle,
}: {
  wish: string[];
  toggle: (id: string) => void;
}) {
  useScrollReveal();
  const publishedProducts = useCatalog();
  const [initialFilters] = useState(() => {
    const params =
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);
    return {
      category: params.get("category") || "All",
      size: params.get("size") || "All",
      sort: params.get("sort") || "featured",
      query: params.get("q") || "",
    };
  });
  const [category, setCategory] = useState(initialFilters.category),
    [size, setSize] = useState(initialFilters.size),
    [sort, setSort] = useState(initialFilters.sort),
    [query, setQuery] = useState(initialFilters.query);
  const [filtersOpen, setFiltersOpen] = useState(false),
    [filtersClosing, setFiltersClosing] = useState(false),
    [draftCategory, setDraftCategory] = useState(initialFilters.category),
    [draftSize, setDraftSize] = useState(initialFilters.size),
    [draftSort, setDraftSort] = useState(initialFilters.sort);
  const closeFilters = () => {
    setFiltersClosing(true);
    window.setTimeout(() => {
      setFiltersOpen(false);
      setFiltersClosing(false);
    }, 220);
  };
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category !== "All") params.set("category", category);
    if (size !== "All") params.set("size", size);
    if (sort !== "featured") params.set("sort", sort);
    window.history.replaceState(
      null,
      "",
      `/shop${params.size ? `?${params}` : ""}`,
    );
  }, [category, size, sort, query]);
  const shown = useMemo(
    () =>
      publishedProducts
        .filter(
          (p) =>
            (category === "All" || p.category === category) &&
            (size === "All" ||
              p.variants.some((v) => v.size === size && v.open)) &&
            p.name.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "low"
            ? a.priceKobo - b.priceKobo
            : sort === "high"
              ? b.priceKobo - a.priceKobo
              : a.id.localeCompare(b.id),
        ),
    [category, size, sort, query, publishedProducts],
  );
  const returnTo = `/shop${typeof window !== "undefined" ? window.location.search : ""}`;
  const clear = () => {
    setCategory("All");
    setSize("All");
    setSort("featured");
    setDraftCategory("All");
    setDraftSize("All");
    setDraftSort("featured");
  };
  const active = [
    category !== "All"
      ? {
          label: category,
          clear: () => {
            setCategory("All");
            setDraftCategory("All");
          },
        }
      : null,
    size !== "All"
      ? {
          label: `Size ${size}`,
          clear: () => {
            setSize("All");
            setDraftSize("All");
          },
        }
      : null,
    sort !== "featured"
      ? {
          label: sort === "low" ? "Price low–high" : "Price high–low",
          clear: () => {
            setSort("featured");
            setDraftSort("featured");
          },
        }
      : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];
  return (
    <main className="page shop-page">
      <div className="page-intro">
        <p className="eyebrow">Published sample designs</p>
        <h1>The first study</h1>
        <p>Preorder styles, with preparation shown before checkout.</p>
      </div>
      <div className="shop-controls">
        <label className="search">
          <Search />
          <input
            aria-label="Search designs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search designs"
          />
        </label>
        <div className="desktop-filters">
          <label>
            Category
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setDraftCategory(e.target.value);
              }}
            >
              <option>All</option>
              <option>Dresses</option>
              <option>Sets</option>
              <option>Separates</option>
              <option>Occasion</option>
            </select>
          </label>
          <label>
            Size
            <select
              value={size}
              onChange={(e) => {
                setSize(e.target.value);
                setDraftSize(e.target.value);
              }}
            >
              <option>All</option>
              {["XS", "S", "M", "L", "XL"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setDraftSort(e.target.value);
              }}
            >
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </label>
        </div>
        <button
          className="filter-trigger"
          onClick={() => {
            setDraftSize(size);
            setDraftSort(sort);
            setFiltersOpen(true);
          }}
        >
          <SlidersHorizontal />
          Filter & sort{active.length > 0 && <span>{active.length}</span>}
        </button>
      </div>
      {filtersOpen && (
        <div
          className={`filter-overlay ${filtersClosing ? "is-closing" : ""}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeFilters();
          }}
        >
          <section
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-title"
          >
            <button
              className="icon-button filter-close"
              onClick={closeFilters}
              aria-label="Close filters"
            >
              <X />
            </button>
            <div className="filter-sheet-header">
              <h2 id="filter-title">Filter & sort</h2>
              <p>Refine the sample collection.</p>
              <div className="filter-sheet-fields">
                <label>
                  Category
                  <select
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value)}
                  >
                    <option>All</option>
                    <option>Dresses</option>
                    <option>Sets</option>
                    <option>Separates</option>
                    <option>Occasion</option>
                  </select>
                </label>
                <label>
                  Size
                  <select
                    value={draftSize}
                    onChange={(e) => setDraftSize(e.target.value)}
                  >
                    <option>All</option>
                    {["XS", "S", "M", "L", "XL"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Sort
                  <select
                    value={draftSort}
                    onChange={(e) => setDraftSort(e.target.value)}
                  >
                    <option value="featured">Featured</option>
                    <option value="low">Price: low to high</option>
                    <option value="high">Price: high to low</option>
                  </select>
                </label>
              </div>
              <div className="filter-sheet-footer">
                <button
                  className="button dark"
                  onClick={() => {
                    setCategory(draftCategory);
                    setSize(draftSize);
                    setSort(draftSort);
                    closeFilters();
                  }}
                >
                  Apply
                </button>
                <button className="button clear-button" onClick={clear}>
                  Clear all
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {active.length > 0 && (
        <div className="active-filters" aria-label="Active filters">
          {active.map((item) => (
            <button key={item.label} onClick={item.clear}>
              {item.label}
              <X />
            </button>
          ))}
          <button className="clear-link" onClick={clear}>
            Clear all
          </button>
        </div>
      )}
      {shown.length ? (
        <div className="reveal-on-scroll">
          <ProductGrid
            items={shown}
            wish={wish}
            toggle={toggle}
            returnTo={returnTo}
          />
        </div>
      ) : (
        <div className="empty-state">
          <h2>No designs match</h2>
          <p>Try clearing a filter or searching for another name.</p>
          <button
            className="button dark"
            onClick={() => {
              clear();
              setQuery("");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </main>
  );
}

function Detail({
  p,
  add,
  wish,
  toggle,
}: {
  p: Product;
  add: (p: Product, v: string, q: number) => void;
  wish: string[];
  toggle: (id: string) => void;
}) {
  useScrollReveal();
  const publishedProducts = useCatalog();
  const colours = [...new Set(p.variants.map((v) => v.colour))];
  const [colour, setColour] = useState(colours[0]),
    [variant, setVariant] = useState(""),
    [qty, setQty] = useState(1),
    [message, setMessage] = useState(""),
    [adding, setAdding] = useState(false),
    [wishMessage, setWishMessage] = useState(""),
    [sizeGuideOpen, setSizeGuideOpen] = useState(false),
    [activeImage, setActiveImage] = useState(0),
    [collectionHref] = useState(() => {
      if (typeof window === "undefined") return "/shop";
      const from = new URLSearchParams(window.location.search).get("from");
      return from?.startsWith("/shop") ? from : "/shop";
    });
  const options = p.variants.filter((v) => v.colour === colour),
    selected = p.variants.find((v) => v.id === variant);
  const matchingImages = p.images.filter(
      (image) => !image.colour || image.colour === colour,
    ),
    galleryImages = matchingImages.length ? matchingImages : p.images;
  const related = [...publishedProducts]
    .filter((item) => item.id !== p.id)
    .sort(
      (a, b) =>
        Number(b.category === p.category) - Number(a.category === p.category),
    )
    .slice(0, 4);
  return (
    <main className="product-page">
      <section
        className="gallery reveal-on-scroll"
        aria-label={`${p.name} image gallery`}
      >
        <div className="desktop-gallery">
          <div className="gallery-thumbnails">
            {galleryImages.map((image, index) => (
              <button
                type="button"
                key={`${image.src}-${index}`}
                className={activeImage === index ? "selected" : ""}
                onClick={() => setActiveImage(index)}
                aria-current={activeImage === index ? "true" : undefined}
                aria-label={`Show image ${index + 1} of ${galleryImages.length}`}
              >
                <img src={image.src} alt="" />
              </button>
            ))}
          </div>
          <div className="main-product-image">
            <img
              src={galleryImages[activeImage]?.src ?? p.image}
              alt={galleryImages[activeImage]?.alt ?? p.name}
            />
          </div>
        </div>
        <div
          className="mobile-gallery"
          onScroll={(event) => {
            const el = event.currentTarget;
            setActiveImage(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {galleryImages.map((image, index) => (
            <div className="mobile-gallery-slide" key={`${image.src}-${index}`}>
              <img src={image.src} alt={image.alt} />
            </div>
          ))}
        </div>
        <span className="gallery-indicator">
          {activeImage + 1} / {galleryImages.length}
        </span>
      </section>
      <div className="product-info reveal-on-scroll">
        <a className="collection-back" href={collectionHref}>
          Back to collection
        </a>
        <div className="product-heading">
          <p className="eyebrow">
            {p.category}
            {p.sample ? " · Sample design" : ""}
          </p>
          <h1>{p.name}</h1>
          <p className="detail-price">
            {formatNaira(p.priceKobo)} {p.sample && <span>sample price</span>}
          </p>
          <p className="description">{p.description}</p>
        </div>
        <p className="timing-line">
          <strong>
            {p.preparation.dispatchDate
              ? `Scheduled to dispatch on ${p.preparation.dispatchDate}.`
              : `Ready to dispatch in ${p.preparation.min}–${p.preparation.max} ${p.preparation.basis}.`}
          </strong>{" "}
          <a href="#delivery">Delivery details</a>
        </p>
        <fieldset className="colour-field">
          <legend>
            Colour <strong>{colour}</strong>
          </legend>
          <div className="option-row">
            {colours.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => {
                  setColour(c);
                  setVariant("");
                  setActiveImage(0);
                }}
                className={colour === c ? "selected" : ""}
                aria-pressed={colour === c}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="size-field">
          <legend>
            Choose a size{" "}
            <button
              type="button"
              className="size-guide-link"
              aria-expanded={sizeGuideOpen}
              onClick={() => setSizeGuideOpen((open) => !open)}
            >
              Size guide
            </button>
          </legend>
          <div className="size-row">
            {options.map((v) => (
              <button
                type="button"
                key={v.id}
                disabled={!v.open || v.capacity === 0}
                onClick={() => setVariant(v.id)}
                className={variant === v.id ? "selected" : ""}
                aria-pressed={variant === v.id}
              >
                {v.size}
                <small>{!v.open || v.capacity === 0 ? "Closed" : ""}</small>
              </button>
            ))}
          </div>
          {sizeGuideOpen && (
            <div className="size-guide-note">
              <p>HERLIYAH sizes use the approved brand guide for XS–XL.</p>
              {p.measurements && Object.keys(p.measurements).length > 0 && (
                <dl>
                  {Object.entries(p.measurements).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {typeof value === "string"
                          ? value
                          : JSON.stringify(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </fieldset>
        <div className="purchase-controls">
          <div className="quantity-row">
            <label htmlFor="product-quantity">Quantity</label>
            <select
              id="product-quantity"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            >
              {[1, 2, 3]
                .filter((q) => !selected || q <= selected.capacity)
                .map((q) => (
                  <option key={q}>{q}</option>
                ))}
            </select>
          </div>
          <div className="purchase-actions">
            <button
              className="button dark"
              disabled={adding}
              aria-busy={adding}
              onClick={() => {
                if (adding) return;
                if (!selected) {
                  setMessage(
                    "Choose an available size before adding to your bag.",
                  );
                  return;
                }
                setAdding(true);
                setMessage("");
                window.setTimeout(() => {
                  add(p, selected.id, qty);
                  setAdding(false);
                  setMessage(`${p.name} was added to your bag.`);
                }, 220);
              }}
            >
              {adding ? "Adding…" : message ? "Added to bag" : "Add to bag"}
            </button>
            <button
              className="icon-button bordered"
              onClick={() => {
                const saved = wish.includes(p.id);
                toggle(p.id);
                setWishMessage(
                  saved ? "Removed from wishlist" : "Saved to wishlist",
                );
                window.setTimeout(() => setWishMessage(""), 1400);
              }}
              aria-pressed={wish.includes(p.id)}
              aria-label={
                wish.includes(p.id)
                  ? "Remove from wishlist"
                  : "Save to wishlist"
              }
            >
              <Heart fill={wish.includes(p.id) ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        {wishMessage && (
          <p className="wishlist-message" role="status">
            {wishMessage}
          </p>
        )}
        {message && (
          <p className="inline-message" role="status">
            {message}
          </p>
        )}
        <div className="accordion-copy">
          <details>
            <summary>Care</summary>
            <p>
              {p.careInstructions || "Care instructions are being finalised."}
            </p>
          </details>
          <details id="delivery">
            <summary>Delivery & returns</summary>
            <p>
              The preparation window begins after verified payment and ends when
              the piece is ready to dispatch. Courier delivery starts after
              dispatch; timing depends on the delivery zone selected at
              checkout.
            </p>
          </details>
        </div>
      </div>
      <section className="related-products reveal-on-scroll">
        <div className="related-heading">
          <div>
            <p className="eyebrow">Continue browsing</p>
            <h2>You may also like</h2>
          </div>
          <a href={collectionHref}>Back to the collection</a>
        </div>
        <ProductGrid
          items={related}
          wish={wish}
          toggle={toggle}
          returnTo={collectionHref}
        />
      </section>
    </main>
  );
}

function Cart({
  cart,
  setCart,
}: {
  cart: CartItem[];
  setCart: (v: CartItem[]) => void;
}) {
  const products = useCatalog();
  const rows = cart.map((item) => {
      const p = products.find((x) => x.id === item.productId)!;
      return { item, p, v: p.variants.find((x) => x.id === item.variantId)! };
    }),
    subtotal = rows.reduce((s, r) => s + r.p.priceKobo * r.item.quantity, 0),
    max = rows.reduce((m, r) => Math.max(m, r.p.preparation.max), 0);
  return (
    <main className="page cart-page">
      <div className="page-intro">
        <p className="eyebrow">Your selection</p>
        <h1>Shopping bag</h1>
      </div>
      {!rows.length ? (
        <div className="empty-state">
          <ShoppingBag />
          <h2>Your bag is empty</h2>
          <p>Explore ten sample preorder designs.</p>
          <a className="button dark" href="/shop">
            Shop the collection
          </a>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-list">
            {rows.map(({ item, p, v }) => (
              <article className="cart-row" key={item.variantId}>
                <img src={p.image} alt="" />
                <div>
                  <h2>{p.name}</h2>
                  <p>
                    {v.colour} · {v.size}
                  </p>
                  <p className="lead-time">
                    Ready to dispatch in {p.preparation.min}–{p.preparation.max}{" "}
                    business days after payment
                  </p>
                  <div className="quantity">
                    <button
                      aria-label="Decrease quantity"
                      onClick={() =>
                        setCart(
                          item.quantity === 1
                            ? cart.filter((i) => i.variantId !== item.variantId)
                            : cart.map((i) =>
                                i.variantId === item.variantId
                                  ? { ...i, quantity: i.quantity - 1 }
                                  : i,
                              ),
                        )
                      }
                    >
                      <Minus />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label="Increase quantity"
                      disabled={item.quantity >= v.capacity}
                      onClick={() =>
                        setCart(
                          cart.map((i) =>
                            i.variantId === item.variantId
                              ? { ...i, quantity: i.quantity + 1 }
                              : i,
                          ),
                        )
                      }
                    >
                      <Plus />
                    </button>
                    <button
                      className="remove"
                      onClick={() =>
                        setCart(
                          cart.filter((i) => i.variantId !== item.variantId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <strong>{formatNaira(p.priceKobo * item.quantity)}</strong>
              </article>
            ))}
          </section>
          <aside className="summary">
            <h2>Order summary</h2>
            <div>
              <span>Sample subtotal</span>
              <strong>{formatNaira(subtotal)}</strong>
            </div>
            <div>
              <span>Delivery</span>
              <strong>Calculated after zone</strong>
            </div>
            <p className="summary-notice">
              Combined-shipping assumption: dispatch together when the slowest
              style is ready, currently up to {max} business days after verified
              payment.
            </p>
            <a className="button olive" href="/checkout">
              Continue to checkout
            </a>
            <small>
              No capacity is reserved until payment is initiated on the server.
            </small>
          </aside>
        </div>
      )}
    </main>
  );
}

type CheckoutDetails = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  landmark: string;
  note: string;
  terms: boolean;
};
type Quote = {
  items: {
    variantId: string;
    name: string;
    image: string;
    colour: string;
    size: string;
    quantity: number;
    unitPriceKobo: number;
    lineTotalKobo: number;
    preparationMinDays: number;
    preparationMaxDays: number;
  }[];
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  courierEstimate: string;
  paymentsEnabled: boolean;
  shippingPolicy?: { mode: string };
};
type DeliveryZone = {
  id: string;
  name: string;
  feeKobo: number;
  transitMinDays: number;
  transitMaxDays: number;
  transitDayBasis: string;
};
const emptyCheckout: CheckoutDetails = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  landmark: "",
  note: "",
  terms: false,
};
function Checkout({ cart }: { cart: CartItem[] }) {
  const [details, setDetails] = useStored<CheckoutDetails>(
      CHECKOUT_KEY,
      emptyCheckout,
    ),
    [checkoutSession, setCheckoutSession] = useStored<{
      idempotencyKey: string;
      reference?: string;
      orderId?: string;
      accessToken?: string;
    }>(CHECKOUT_SESSION_KEY, EMPTY_CHECKOUT_SESSION),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]),
    [deliveryZoneId, setDeliveryZoneId] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [quoteError, setQuoteError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [confirmation, setConfirmation] = useState<{
      reference: string;
      orderId: string;
      authorizationUrl?: string;
      paymentStatus: string;
      orderStatus: string;
    } | null>(null);
  useEffect(() => {
    fetch("/api/delivery-options")
      .then(async (response) => {
        if (!response.ok) throw new Error("delivery_options_failed");
        return response.json() as Promise<{ zones: DeliveryZone[] }>;
      })
      .then(({ zones }) => {
        setDeliveryZones(zones);
        setDeliveryZoneId((current) => current || zones[0]?.id || "");
      })
      .catch(() =>
        setQuoteError("Delivery options are temporarily unavailable."),
      );
  }, []);
  useEffect(() => {
    if (!cart.length || !deliveryZoneId) return;
    fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deliveryZoneId,
        lines: cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      }),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error((await response.json()).error || "quote_failed");
        return response.json();
      })
      .then(setQuote)
      .catch(() =>
        setQuoteError(
          "We could not refresh this order total. Please try again.",
        ),
      );
  }, [cart, deliveryZoneId]);
  const field = (
    name: keyof CheckoutDetails,
    label: string,
    type = "text",
    autoComplete?: string,
  ) => (
    <label>
      {label}
      <input
        value={String(details[name])}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={Boolean(errors[name])}
        onChange={(event) => {
          setDetails((current) => ({ ...current, [name]: event.target.value }));
          setErrors((current) => ({ ...current, [name]: "" }));
        }}
      />
      {errors[name] && <small className="field-error">{errors[name]}</small>}
    </label>
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const next: Record<string, string> = {};
    (
      [
        "fullName",
        "email",
        "phone",
        "address",
        "city",
        "state",
      ] as (keyof CheckoutDetails)[]
    ).forEach((key) => {
      if (!String(details[key]).trim()) next[key] = "Required";
    });
    if (details.email && !/^\S+@\S+\.\S+$/.test(details.email))
      next.email = "Enter a valid email";
    if (!details.terms) next.terms = "Please confirm the preorder notice";
    setErrors(next);
    if (Object.keys(next).length || !quote) return;
    setSubmitting(true);
    try {
      const idempotencyKey =
        checkoutSession.idempotencyKey || crypto.randomUUID();
      if (!checkoutSession.idempotencyKey)
        setCheckoutSession({ idempotencyKey });
      const response = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          customer: details,
          deliveryZoneId,
          lines: cart.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "checkout_failed");
      setCheckoutSession({
        idempotencyKey,
        reference: body.reference,
        orderId: body.orderId,
        accessToken: body.accessToken || checkoutSession.accessToken,
      });
      setConfirmation(body);
      if (body.authorizationUrl?.startsWith("https://"))
        window.location.assign(body.authorizationUrl);
    } catch {
      setQuoteError(
        "Checkout could not be started. Your details and bag are saved; please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  if (!cart.length)
    return (
      <main className="page">
        <div className="empty-state">
          <h1>Checkout is waiting for a bag</h1>
          <a className="button dark" href="/shop">
            Shop all
          </a>
        </div>
      </main>
    );
  if (confirmation)
    return (
      <main className="page checkout-page">
        <div className="status-panel pending-status">
          <span className="status-mark">H</span>
          <p className="eyebrow">Payment pending</p>
          <h1>Your order is reserved</h1>
          <p>
            Your order and its 20-minute capacity hold are stored. Production
            begins only after server-verified payment.
          </p>
          <p>
            <strong>Reference</strong>
            <br />
            {confirmation.reference}
          </p>
          <p>
            Preparation begins only after verified payment. Courier delivery
            begins after dispatch.
          </p>
          <a
            className="button dark"
            href={`/checkout/status?reference=${encodeURIComponent(confirmation.reference)}`}
          >
            Continue to payment status
          </a>
        </div>
      </main>
    );
  return (
    <main className="page checkout-page">
      <div className="checkout-title">
        <div>
          <p className="eyebrow">Guest checkout · preview</p>
          <h1>Delivery details</h1>
          <p>
            Checkout without an account.{" "}
            <a href="/account">Sign in is optional.</a>
          </p>
        </div>
        <span>Payments disabled in preview</span>
      </div>
      <form className="checkout-layout" onSubmit={submit} noValidate>
        <section className="checkout-form">
          <h2>Customer</h2>
          {field("fullName", "Full name", "text", "name")}
          {field("email", "Email", "email", "email")}
          {field("phone", "Phone", "tel", "tel")}
          <h2>Delivery address</h2>
          {field("address", "Address", "text", "street-address")}
          <div className="two-fields">
            {field("city", "City / area")}
            {
              <label>
                State
                <select
                  value={details.state}
                  aria-invalid={Boolean(errors.state)}
                  onChange={(event) => {
                    setDetails((current) => ({
                      ...current,
                      state: event.target.value,
                    }));
                    setErrors((current) => ({ ...current, state: "" }));
                  }}
                >
                  <option value="">Select state</option>
                  <option value="Lagos">Lagos (sample delivery)</option>
                </select>
                {errors.state && (
                  <small className="field-error">{errors.state}</small>
                )}
              </label>
            }
          </div>
          {field("landmark", "Landmark (optional)")}
          <label>
            Delivery zone
            <select
              value={deliveryZoneId}
              onChange={(event) => setDeliveryZoneId(event.target.value)}
              required
            >
              {deliveryZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} - {formatNaira(zone.feeKobo)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order note <span>optional</span>
            <textarea
              rows={3}
              value={details.note}
              onChange={(event) =>
                setDetails((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
          </label>
        </section>
        <aside className="summary checkout-summary">
          <h2>Order summary</h2>
          {quote ? (
            <>
              <div className="checkout-items">
                {quote.items.map((item) => (
                  <article key={item.variantId}>
                    <img src={item.image} alt="" />
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.colour} · {item.size} · Qty {item.quantity}
                      </span>
                      <small>
                        Ready to dispatch in {item.preparationMinDays}–
                        {item.preparationMaxDays} business days after payment
                      </small>
                    </div>
                    <strong>{formatNaira(item.lineTotalKobo)}</strong>
                  </article>
                ))}
              </div>
              <div>
                <span>Subtotal</span>
                <strong>{formatNaira(quote.subtotalKobo)}</strong>
              </div>
              <div>
                <span>Delivery fee</span>
                <strong>{formatNaira(quote.deliveryFeeKobo)}</strong>
              </div>
              <div className="total">
                <span>Total</span>
                <strong>{formatNaira(quote.totalKobo)}</strong>
              </div>
              <p className="delivery-note">
                <strong>Courier delivery:</strong> {quote.courierEstimate}
              </p>
            </>
          ) : (
            <p>{quoteError || "Calculating the order on the server…"}</p>
          )}
          <label className="terms">
            <input
              type="checkbox"
              checked={details.terms}
              onChange={(event) => {
                setDetails((current) => ({
                  ...current,
                  terms: event.target.checked,
                }));
                setErrors((current) => ({ ...current, terms: "" }));
              }}
            />
            I understand preparation begins after verified payment and is
            separate from courier delivery.
          </label>
          {errors.terms && (
            <small className="field-error">{errors.terms}</small>
          )}
          {quoteError && quote && (
            <p className="checkout-error" role="alert">
              {quoteError}
            </p>
          )}
          <button
            className="button olive"
            type="submit"
            disabled={!quote || submitting}
          >
            {submitting ? "Creating secure checkout…" : "Continue to payment"}
          </button>
          <small>
            The server validates prices and holds capacity for 20 minutes. Live
            Paystack keys remain disabled.
          </small>
        </aside>
      </form>
    </main>
  );
}

type PaymentState = {
  reference: string;
  paymentStatus: string;
  orderStatus: string;
  fulfilmentStatus: string;
  orderNumber: string;
  authorizationUrl?: string;
  failureReason?: string;
};
function PaymentStatus({
  callback,
  setCart,
}: {
  callback: boolean;
  setCart: (items: CartItem[]) => void;
}) {
  const [reference] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("reference") || "",
  );
  const [state, setState] = useState<PaymentState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async (verify = false) => {
      if (!reference) return;
      setBusy(true);
      setError("");
      try {
        if (verify) {
          const verified = await fetch(
            `/api/checkout/payments/${encodeURIComponent(reference)}/verify`,
            { method: "POST" },
          );
          if (!verified.ok && verified.status !== 409)
            throw new Error("verification_failed");
        }
        const response = await fetch(
          `/api/checkout/status/${encodeURIComponent(reference)}`,
        );
        if (!response.ok) throw new Error("status_failed");
        const next = (await response.json()) as PaymentState;
        setState(next);
        if (next.orderStatus === "confirmed") setCart([]);
      } catch {
        setError(
          "We could not refresh payment status. Your order is still stored; please try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [reference, setCart],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(callback), 0);
    return () => window.clearTimeout(timer);
  }, [callback, refresh]);
  const simulate = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/checkout/payments/${encodeURIComponent(reference)}/simulate-success`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("simulation_failed");
      await refresh();
    } catch {
      setError("Preview payment simulation failed. The order remains pending.");
    } finally {
      setBusy(false);
    }
  };
  if (!reference)
    return (
      <main className="page">
        <div className="empty-state">
          <h1>Payment reference missing</h1>
          <a className="button dark" href="/cart">
            Return to bag
          </a>
        </div>
      </main>
    );
  const confirmed = state?.orderStatus === "confirmed",
    exception = state?.orderStatus === "payment_exception",
    failed =
      state?.paymentStatus === "failed" ||
      state?.orderStatus === "payment_failed";
  return (
    <main className="page checkout-page">
      <div
        className={`status-panel pending-status ${confirmed ? "success" : ""}`}
      >
        <span className="status-mark">H</span>
        <p className="eyebrow">
          {confirmed
            ? "Payment confirmed"
            : exception
              ? "Owner review required"
              : failed
                ? "Payment failed"
                : "Payment pending"}
        </p>
        <h1>
          {confirmed
            ? "Your preorder is confirmed."
            : exception
              ? "Your payment needs review."
              : failed
                ? "Payment was not completed."
                : "We’re waiting for verification."}
        </h1>
        {state && (
          <>
            <p>
              <strong>{state.orderNumber}</strong>
              <br />
              Reference {state.reference}
            </p>
            <p>
              {confirmed
                ? "Capacity is allocated and the order may enter production."
                : exception
                  ? "Payment was received but capacity allocation could not be confirmed. HERLIYAH must resolve this before production."
                  : failed
                    ? "Your bag and customer details are preserved so you can start a new checkout."
                    : "A browser return alone never confirms an order. Use Refresh status while the server verifies Paystack."}
            </p>
          </>
        )}
        {error && (
          <p className="checkout-error" role="alert">
            {error}
          </p>
        )}
        <div className="status-actions">
          <button
            className="button dark"
            disabled={busy}
            onClick={() => void refresh(callback)}
          >
            {busy ? "Checking…" : "Refresh status"}
          </button>
          {!confirmed &&
            !exception &&
            !failed &&
            state?.authorizationUrl?.startsWith("/checkout/status") && (
              <button
                className="button olive"
                disabled={busy}
                onClick={simulate}
              >
                Complete preview payment
              </button>
            )}
        </div>
        {confirmed && (
          <div className="status-actions">
            <a className="button dark" href="/track">
              Track this order
            </a>
            <a className="button olive" href="/shop">
              Continue shopping
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

type AccountOrder = {
  id: string;
  order_number: string;
  total_kobo: number;
  fulfilment_status: string;
  items: Array<{ title_snapshot: string; quantity: number }>;
};
type AuthConfig = {
  enabled: boolean;
  authorizationUrl?: string;
  clientId?: string;
  audience?: string;
};
const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
function Account() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [message, setMessage] = useState("");
  const loadAccount = useCallback(async () => {
    const me = await fetch("/api/customer/me");
    if (!me.ok) return false;
    const body = (await me.json()) as { customer: { email: string } | null };
    if (!body.customer) return false;
    localStorage.setItem(CUSTOMER_CONNECTED_KEY, "1");
    setEmail(body.customer.email);
    const history = await fetch("/api/customer/orders");
    if (history.ok)
      setOrders(((await history.json()) as { orders: AccountOrder[] }).orders);
    return true;
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/auth/config")
        .then((response) => response.json() as Promise<AuthConfig>)
        .then(setConfig);
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const expectedState = sessionStorage.getItem("herliyah-oauth-state");
      const verifier = sessionStorage.getItem("herliyah-oauth-verifier");
      if (code && state && state === expectedState && verifier) {
        void fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code,
            verifier,
            redirectUri: `${window.location.origin}/account`,
          }),
        })
          .then(async (response) => {
            if (!response.ok) throw new Error("authentication_failed");
            sessionStorage.removeItem("herliyah-oauth-state");
            sessionStorage.removeItem("herliyah-oauth-verifier");
            window.history.replaceState(null, "", "/account");
            await loadAccount();
          })
          .catch(() =>
            setMessage("Sign-in could not be completed. Please try again."),
          );
      } else {
        void loadAccount();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount]);
  const signIn = async () => {
    if (!config?.authorizationUrl || !config.clientId) return;
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier),
    );
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    sessionStorage.setItem("herliyah-oauth-verifier", verifier);
    sessionStorage.setItem("herliyah-oauth-state", state);
    const url = new URL(config.authorizationUrl);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", `${window.location.origin}/account`);
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("code_challenge", base64Url(new Uint8Array(digest)));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    if (config.audience) url.searchParams.set("audience", config.audience);
    window.location.assign(url);
  };
  return (
    <main className="page">
      <div className="page-intro">
        <p className="eyebrow">Optional account</p>
        <h1>Your HERLIYAH</h1>
        <p>
          Guest checkout always remains available. A verified account gathers
          your orders and saved designs across devices.
        </p>
      </div>
      <div className="account-grid">
        <section className="status-panel">
          <h2>Order history</h2>
          {email ? (
            orders.length ? (
              orders.map((order) => (
                <div className="preview-order" key={order.id}>
                  <span>
                    {order.items.map((item) => item.title_snapshot).join(", ")}
                  </span>
                  <strong>{order.order_number}</strong>
                  <p>
                    {order.fulfilment_status.replaceAll("_", " ")} -{" "}
                    {formatNaira(order.total_kobo)}
                  </p>
                </div>
              ))
            ) : (
              <p>No orders are linked to {email} yet.</p>
            )
          ) : (
            <p>
              Sign in with your verified email to see only orders belonging to
              you.
            </p>
          )}
        </section>
        <section className="status-panel">
          <h2>Why create an account?</h2>
          <ul>
            <li>See owner-entered production updates</li>
            <li>Keep a wishlist across devices</li>
            <li>Automatically link orders placed with your verified email</li>
          </ul>
          {email ? (
            <button
              className="button dark"
              onClick={() =>
                void fetch("/api/auth/logout", { method: "POST" }).then(() => {
                  localStorage.removeItem(CUSTOMER_CONNECTED_KEY);
                  window.location.reload();
                })
              }
            >
              Sign out
            </button>
          ) : (
            <button
              className="button dark"
              disabled={!config?.enabled}
              onClick={() => void signIn()}
            >
              {config?.enabled
                ? "Sign in securely"
                : "Sign in - setup required"}
            </button>
          )}
          {message && <p className="checkout-error">{message}</p>}
        </section>
      </div>
    </main>
  );
}
function Wishlist({
  wish,
  toggle,
}: {
  wish: string[];
  toggle: (id: string) => void;
}) {
  const publishedProducts = useCatalog();
  const saved = publishedProducts.filter((p) => wish.includes(p.id));
  return (
    <main className="page">
      <div className="page-intro">
        <p className="eyebrow">Saved designs</p>
        <h1>Wishlist</h1>
        <p>
          Saving never reserves preorder capacity or guarantees availability.
        </p>
      </div>
      {saved.length ? (
        <ProductGrid items={saved} wish={wish} toggle={toggle} />
      ) : (
        <div className="empty-state">
          <Heart />
          <h2>Nothing saved yet</h2>
          <p>
            Use the heart on any sample design to keep it here on this device.
          </p>
          <a className="button dark" href="/shop">
            Browse designs
          </a>
        </div>
      )}
      <p className="simulation-strip">
        Device-only preview. Cross-device persistence begins after managed
        authentication is connected.
      </p>
    </main>
  );
}
type TrackedOrder = {
  order_number: string;
  order_status: string;
  fulfilment_status: string;
  dispatch_min_date?: string;
  dispatch_max_date?: string;
  revised_dispatch_min_date?: string;
  revised_dispatch_max_date?: string;
  delay_message?: string;
  courier_name?: string;
  tracking_reference?: string;
  tracking_url?: string;
  payment?: { status: string };
  items: Array<{ title_snapshot: string }>;
};
function LiveTracking() {
  const [order, setOrder] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = JSON.parse(
        localStorage.getItem(CHECKOUT_SESSION_KEY) || "{}",
      ) as { orderId?: string; accessToken?: string };
      setOrder(saved.orderId || "");
      setToken(saved.accessToken || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const track = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/orders/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order, token }),
    });
    if (!response.ok) {
      setResult(null);
      setError("The order identifier and private token did not match.");
      return;
    }
    setResult(await response.json());
  };
  const stages = [
    "confirmed",
    "in_preparation",
    "ready_to_dispatch",
    "dispatched",
    "delivered",
  ];
  const currentIndex = result ? stages.indexOf(result.fulfilment_status) : -1;
  return (
    <main className="page track-page">
      <div className="page-intro">
        <p className="eyebrow">Private guest order access</p>
        <h1>Follow its progress</h1>
        <p>
          Enter the order identifier and high-entropy token saved at checkout. A
          matching email or order number alone never grants access.
        </p>
      </div>
      <form className="tracking-form" onSubmit={track}>
        <label>
          Order ID or number
          <input
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
        </label>
        <label>
          Private access token
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button className="button dark" type="submit">
          Track order
        </button>
      </form>
      {error && <p className="checkout-error">{error}</p>}
      {result && (
        <section className="tracking-card">
          <div className="tracking-top">
            <div>
              <span>{result.order_number}</span>
              <h2>
                {result.items.map((item) => item.title_snapshot).join(", ")}
              </h2>
              <p>
                Original dispatch estimate:{" "}
                {result.dispatch_min_date || "pending"}
                {result.dispatch_max_date && ` to ${result.dispatch_max_date}`}.
              </p>
              {result.revised_dispatch_min_date && (
                <p>
                  Revised dispatch estimate: {result.revised_dispatch_min_date}
                  {result.revised_dispatch_max_date &&
                    ` to ${result.revised_dispatch_max_date}`}
                  .{result.delay_message && ` ${result.delay_message}`}
                </p>
              )}
            </div>
            <strong>{result.fulfilment_status.replaceAll("_", " ")}</strong>
          </div>
          <p>Payment: {result.payment?.status || result.order_status}</p>
          <ol>
            {stages.map((stage, index) => (
              <li
                key={stage}
                className={
                  index < currentIndex
                    ? "complete"
                    : index === currentIndex
                      ? "current"
                      : ""
                }
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{stage.replaceAll("_", " ")}</strong>
                </div>
              </li>
            ))}
          </ol>
          <div className="delivery-separation">
            <strong>Preparation and dispatch</strong>
            <p>
              HERLIYAH records production progress and the dispatch promise
              above.
            </p>
            <strong>Courier delivery</strong>
            <p>
              Begins after dispatch.
              {result.courier_name && ` ${result.courier_name}`}
              {result.tracking_reference && ` - ${result.tracking_reference}`}
              {result.tracking_url && (
                <>
                  {" "}
                  - <a href={result.tracking_url}>Courier tracking</a>
                </>
              )}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function Admin() {
  const products = useCatalog();
  return (
    <main className="admin-page">
      <aside className="admin-nav">
        <span className="monogram">H</span>
        <nav>
          {["Overview", "Products", "Inventory", "Orders", "Settings"].map(
            (x, i) => (
              <button className={i === 0 ? "active" : ""} key={x}>
                {x}
              </button>
            ),
          )}
        </nav>
        <span>Preview only</span>
      </aside>
      <section className="admin-main">
        <header>
          <div>
            <p className="eyebrow">Owner workspace</p>
            <h1>Good morning.</h1>
          </div>
          <button className="button dark" disabled>
            Add product
          </button>
        </header>
        <div className="admin-alert">
          <strong>Storefront checkout is paused</strong>
          <span>
            Sample merchandise and incomplete launch settings cannot accept
            payment.
          </span>
        </div>
        <div className="metrics">
          <div>
            <span>Open sample styles</span>
            <strong>10</strong>
          </div>
          <div>
            <span>Active holds</span>
            <strong>0</strong>
          </div>
          <div>
            <span>Orders needing attention</span>
            <strong>2</strong>
          </div>
        </div>
        <div className="admin-grid">
          <section className="admin-card">
            <div className="card-heading">
              <h2>Preorder capacity</h2>
              <button>View all</button>
            </div>
            {products.slice(0, 5).map((p, i) => (
              <div className="capacity-row" key={p.id}>
                <img src={p.image} alt="" />
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {p.variants.reduce((s, v) => s + v.capacity, 0)} sample
                    spaces across variants
                  </span>
                </div>
                <span className={i === 2 ? "warning" : ""}>
                  {i === 2 ? "Low" : "Open"}
                </span>
              </div>
            ))}
          </section>
          <section className="admin-card">
            <div className="card-heading">
              <h2>Order queue</h2>
              <button>View orders</button>
            </div>
            {[
              ["#HLY-00241", "In production"],
              ["#HLY-00240", "Payment exception"],
              ["#HLY-00239", "Quality check"],
            ].map(([id, state]) => (
              <div className="order-row" key={id}>
                <div>
                  <strong>{id}</strong>
                  <span>Sample customer · 1 item</span>
                </div>
                <span>{state}</span>
              </div>
            ))}
            <p className="review-note">
              Protected writes, uploads and customer data stay disabled until
              managed owner authentication is configured.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
function NotFound() {
  return (
    <main className="page">
      <div className="empty-state error-state">
        <span>H</span>
        <h1>This page isn’t in the sample store.</h1>
        <p>The collection may have moved, or the link is incomplete.</p>
        <a className="button dark" href="/shop">
          Return to shop
        </a>
      </div>
    </main>
  );
}

export default function Storefront() {
  const path = usePathname();
  const [cart, setCart] = useStored<CartItem[]>(CART_KEY, EMPTY_CART),
    [wish, setWish] = useStored<string[]>(WISH_KEY, EMPTY_WISHLIST);
  const [catalog, setCatalog] = useState<Product[]>([]),
    [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">(
      "loading",
    );
  useEffect(() => {
    let active = true;
    fetch("/api/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog_failed");
        return response.json();
      })
      .then((body) => {
        if (active) {
          setCatalog(body.products);
          setCatalogState("ready");
        }
      })
      .catch(() => {
        if (active) setCatalogState("error");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/customer/me").then(async (identity) => {
        const session = (await identity.json()) as { customer: unknown | null };
        if (!session.customer) {
          localStorage.removeItem(CUSTOMER_CONNECTED_KEY);
          return;
        }
        localStorage.setItem(CUSTOMER_CONNECTED_KEY, "1");
        const response = await fetch("/api/customer/wishlist");
        if (!response.ok) return;
        const remote = ((await response.json()) as { productIds: string[] })
          .productIds;
        setWish((local) => {
          const merged = [...new Set([...remote, ...local])];
          void fetch("/api/customer/wishlist", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ productIds: merged }),
          });
          return merged;
        });
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setWish]);
  const toggle = (id: string) =>
    setWish((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      if (localStorage.getItem(CUSTOMER_CONNECTED_KEY))
        void fetch("/api/customer/wishlist", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productIds: next }),
        });
      return next;
    });
  const add = (p: Product, v: string, q: number) =>
    setCart((items) => {
      const found = items.find((i) => i.variantId === v);
      const capacity = p.variants.find((item) => item.id === v)?.capacity ?? 0;
      return found
        ? items.map((i) =>
            i.variantId === v
              ? { ...i, quantity: Math.min(capacity, i.quantity + q) }
              : i,
          )
        : [...items, { productId: p.id, variantId: v, quantity: q }];
    });
  if (catalogState === "loading")
    return (
      <div className="loading-state">
        <span className="monogram">H</span>
        <p>Loading the collection…</p>
      </div>
    );
  if (catalogState === "error")
    return (
      <main className="page">
        <div className="empty-state error-state">
          <span>H</span>
          <h1>The collection is temporarily unavailable.</h1>
          <p>
            The database could not be reached. Please refresh or try again
            shortly.
          </p>
          <button
            className="button dark"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  const slug = path.startsWith("/product/") ? path.split("/")[2] : "",
    p = catalog.find((x) => x.slug === slug),
    admin = path === "/admin";
  return (
    <CatalogContext.Provider value={catalog}>
      <div className="site-shell">
        {!admin && <Header count={cart.reduce((s, i) => s + i.quantity, 0)} />}{" "}
        {path === "/" ? (
          <Home wish={wish} toggle={toggle} />
        ) : path === "/shop" ? (
          <Shop wish={wish} toggle={toggle} />
        ) : p ? (
          <Detail p={p} add={add} wish={wish} toggle={toggle} />
        ) : path === "/cart" ? (
          <Cart cart={cart} setCart={setCart} />
        ) : path === "/checkout" ? (
          <Checkout cart={cart} />
        ) : path === "/checkout/status" ? (
          <PaymentStatus callback={false} setCart={setCart} />
        ) : path === "/checkout/callback" ? (
          <PaymentStatus callback setCart={setCart} />
        ) : path === "/account" ? (
          <Account />
        ) : path === "/wishlist" ? (
          <Wishlist wish={wish} toggle={toggle} />
        ) : path === "/track" ? (
          <LiveTracking />
        ) : admin ? (
          <Admin />
        ) : (
          <NotFound />
        )}
        {!admin && <Footer />}
      </div>
    </CatalogContext.Provider>
  );
}
