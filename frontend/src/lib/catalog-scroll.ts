const CATALOG_SCROLL_KEY = 'catalog-scroll-position';

function normalizePathname(pathname: string) {
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
}

export function saveCatalogScrollPosition(catalogPath: string) {
  sessionStorage.setItem(CATALOG_SCROLL_KEY, JSON.stringify({
    pathname: normalizePathname(catalogPath),
    scrollY: window.scrollY,
  }));
}

export function clearCatalogScrollPosition() {
  sessionStorage.removeItem(CATALOG_SCROLL_KEY);
}

export function takeCatalogScrollPosition(currentPathname: string): number | null {
  const serializedPosition = sessionStorage.getItem(CATALOG_SCROLL_KEY);
  if (!serializedPosition) return null;

  sessionStorage.removeItem(CATALOG_SCROLL_KEY);

  try {
    const position = JSON.parse(serializedPosition) as { pathname?: unknown; scrollY?: unknown };
    if (position.pathname !== normalizePathname(currentPathname)) return null;
    if (typeof position.scrollY !== 'number' || !Number.isFinite(position.scrollY) || position.scrollY < 0) return null;
    return position.scrollY;
  } catch {
    return null;
  }
}
