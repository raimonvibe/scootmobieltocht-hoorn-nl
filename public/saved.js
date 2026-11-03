// Favourite and recent routes, kept only in this browser (localStorage). A route is its URL hash.

const KEY = "scootmobiel-routes";
const MAX_RECENT = 5;

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return { fav: Array.isArray(v?.fav) ? v.fav : [], recent: Array.isArray(v?.recent) ? v.recent : [] };
  } catch { return { fav: [], recent: [] }; }
}
function store(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: not kept */ } }

export const saved = {
  all: load,
  addFavourite(name, hash) {
    const v = load();
    v.fav = v.fav.filter((f) => f.hash !== hash);
    v.fav.unshift({ name, hash });
    store(v);
  },
  removeFavourite(hash) { const v = load(); v.fav = v.fav.filter((f) => f.hash !== hash); store(v); },
  isFavourite(hash) { return load().fav.some((f) => f.hash === hash); },
  addRecent(name, hash) {
    const v = load();
    v.recent = [{ name, hash }, ...v.recent.filter((r) => r.hash !== hash)].slice(0, MAX_RECENT);
    store(v);
  },
};
