import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// Версия shadcn/ui делала setState прямо в эффекте — правило react-hooks/set-state-in-effect
// на это ругается. useSyncExternalStore читает медиазапрос без лишних перерисовок
// и корректно отдаёт false при серверном рендере.
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const COARSE_QUERY = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  const mql = window.matchMedia(COARSE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Основной ввод — палец, а не мышь. Не то же, что узкий экран: планшет широкий,
 * но наведения у него нет, а у ноутбука с сенсорным экраном основной ввод — мышь.
 */
export function useCoarsePointer() {
  return React.useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_QUERY).matches,
    () => false,
  );
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
