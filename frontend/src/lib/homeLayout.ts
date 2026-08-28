// Layout responsivo da home por breakpoint.
//
// O editor da home tem 3 modos de visualização — cada um com sua própria
// largura de canvas de referência. O `x/y/width/height` no topo de cada
// HomeSection é o layout de DESKTOP; `section.tablet` / `section.mobile`
// guardam só o que a loja ajustou naquele modo. O que não foi tocado é
// derivado do desktop, reescalado pela razão das larguras de canvas — assim
// uma loja que nunca abriu o modo tablet já recebe um layout proporcional
// que não estoura as laterais.
//
// No site, `HomeApp` emite as coordenadas dos 3 breakpoints como CSS vars e
// o CSS (media queries em tailwind.css) escolhe qual usar pela largura da
// janela, posicionando tudo em % do canvas daquele breakpoint — então a
// home encolhe junto ("vetorizada") em vez de cortar.

import type { HomeSection } from '@/domain/catalog/types';

export type HomeDevice = 'desktop' | 'tablet' | 'mobile';

export const HOME_DEVICES: { id: HomeDevice; label: string; short: string; canvasWidth: number }[] = [
  { id: 'desktop', label: 'Notebook / telas grandes', short: 'Desktop', canvasWidth: 1200 },
  { id: 'tablet', label: 'Tablet', short: 'Tablet', canvasWidth: 820 },
  { id: 'mobile', label: 'Celular', short: 'Celular', canvasWidth: 390 },
];

export const HOME_CANVAS_WIDTH: Record<HomeDevice, number> = {
  desktop: 1200,
  tablet: 820,
  mobile: 390,
};

export const DEFAULT_BLOCK_WIDTH = 280;
export const DEFAULT_BLOCK_HEIGHT = 320;

export interface ResolvedLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

type LayoutFields = { x?: number; y?: number; width?: number; height?: number };

/** Layout de desktop (o x/y/width/height do topo da section). */
export function desktopLayout(section: LayoutFields): ResolvedLayout {
  return {
    x: section.x ?? 0,
    y: section.y ?? 0,
    width: section.width ?? DEFAULT_BLOCK_WIDTH,
    height: section.height ?? DEFAULT_BLOCK_HEIGHT,
  };
}

/**
 * Layout efetivo de uma section num breakpoint. Desktop = o do topo.
 * Tablet/celular = o ajuste da loja naquele modo, campo a campo; o que não
 * foi tocado cai no desktop reescalado pela razão das larguras de canvas.
 */
export function resolveBreakpointLayout(section: HomeSection, device: HomeDevice): ResolvedLayout {
  const base = desktopLayout(section);
  if (device === 'desktop') return base;

  const ratio = HOME_CANVAS_WIDTH[device] / HOME_CANVAS_WIDTH.desktop;
  const scaled: ResolvedLayout = {
    x: Math.round(base.x * ratio),
    y: Math.round(base.y * ratio),
    width: Math.round(base.width * ratio),
    height: Math.round(base.height * ratio),
  };

  const override = device === 'tablet' ? section.tablet : section.mobile;
  if (!override) return scaled;
  return {
    x: typeof override.x === 'number' ? override.x : scaled.x,
    y: typeof override.y === 'number' ? override.y : scaled.y,
    width: typeof override.width === 'number' ? override.width : scaled.width,
    height: typeof override.height === 'number' ? override.height : scaled.height,
  };
}

/**
 * Aplica uma mudança de posição/tamanho no breakpoint certo: desktop
 * escreve no topo da section; tablet/celular fixam o layout resolvido
 * daquele modo em `section.tablet` / `section.mobile` (a partir daí aquele
 * bloco não acompanha mais mudanças do desktop naquele breakpoint — é o
 * que "editar cada dispositivo do seu jeito" significa).
 */
export function withDeviceLayout(section: HomeSection, device: HomeDevice, patch: Partial<ResolvedLayout>): HomeSection {
  if (device === 'desktop') {
    return { ...section, ...patch };
  }
  const key = device === 'tablet' ? 'tablet' : 'mobile';
  const current = resolveBreakpointLayout(section, device);
  return { ...section, [key]: { ...current, ...patch } };
}

/** Maior borda inferior entre os blocos naquele breakpoint (+ folga). */
export function canvasHeightFor(
  sections: HomeSection[],
  device: HomeDevice,
  minHeight = 400,
  bottomPadding = 60,
): number {
  const bottoms = sections.map((section) => {
    const layout = resolveBreakpointLayout(section, device);
    return layout.y + layout.height + bottomPadding;
  });
  return Math.max(minHeight, ...bottoms);
}
