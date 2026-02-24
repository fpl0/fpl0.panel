import { state, setState } from "./state";

export function toggleSearch() {
  setState("searchOpen", !state.searchOpen);
}

export function closeSearch() {
  setState("searchOpen", false);
}
