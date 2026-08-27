"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
    type ReactNode,
    type RefObject,
} from "react";

// Vídeo decodificando pesa muito mais que imagem parada — com várias peças
// em vídeo na mesma fileira, tocar todas ao mesmo tempo é o maior consumidor
// de CPU/memória da grade. Em vez disso, cada fileira do grid toca só um
// vídeo por vez e revezA entre os que estão visíveis, sem esconder as
// demais peças da fileira (elas ficam paradas na primeira imagem/poster).
//
// A troca acontece quando o vídeo ativo termina (evento nativo `ended`, sem
// `loop`) — não num intervalo arbitrário. MIN evita revezar rápido demais
// se o vídeo for curtíssimo (o card só replay a si mesmo até passar o
// mínimo); MAX é uma rede de segurança pra vídeo muito longo não prender a
// fileira nele pra sempre.
const MIN_ACTIVE_MS = 2000;
const MAX_ACTIVE_MS = 6000;

class RowAutoplayStore {
    private columns = 1;
    private videoIndices = new Set<number>();
    private visibleIndices = new Set<number>();
    private activeByRow = new Map<number, number>();
    private activeStartAt = new Map<number, number>();
    private maxTimers = new Map<number, ReturnType<typeof setTimeout>>();
    private listeners = new Map<number, Set<() => void>>();

    private rowOf(index: number): number {
        return Math.floor(index / this.columns);
    }

    private rowVideoIndices(row: number): number[] {
        const start = row * this.columns;
        const end = start + this.columns;
        const result: number[] = [];
        for (const i of this.videoIndices)
            if (i >= start && i < end) result.push(i);
        return result.sort((a, b) => a - b);
    }

    private visibleCandidates(row: number): number[] {
        return this.rowVideoIndices(row).filter((i) =>
            this.visibleIndices.has(i),
        );
    }

    private clearMaxTimer(row: number) {
        const timer = this.maxTimers.get(row);
        if (timer) clearTimeout(timer);
        this.maxTimers.delete(row);
    }

    private scheduleMaxTimer(row: number) {
        this.clearMaxTimer(row);
        this.maxTimers.set(
            row,
            setTimeout(() => this.advanceRow(row), MAX_ACTIVE_MS),
        );
    }

    setColumns(columns: number) {
        if (columns < 1 || columns === this.columns) return;
        this.columns = columns;
        for (const timer of this.maxTimers.values()) clearTimeout(timer);
        this.maxTimers.clear();
        this.activeByRow.clear();
        this.activeStartAt.clear();
        const rows = new Set([...this.videoIndices].map((i) => this.rowOf(i)));
        for (const row of rows) this.ensureRowActive(row);
        // Fileiras mudaram inteiras com o novo número de colunas — mais simples
        // avisar todo mundo do que rastrear exatamente quem trocou de fileira.
        for (const i of this.videoIndices) this.notifyIndex(i);
    }

    registerVideo(index: number) {
        this.videoIndices.add(index);
        this.ensureRowActive(this.rowOf(index));
    }

    unregisterVideo(index: number) {
        this.videoIndices.delete(index);
        this.visibleIndices.delete(index);
        const row = this.rowOf(index);
        if (this.activeByRow.get(row) === index) {
            this.activeByRow.delete(row);
            this.activeStartAt.delete(row);
            this.ensureRowActive(row);
        }
    }

    setVisible(index: number, visible: boolean) {
        if (visible) this.visibleIndices.add(index);
        else this.visibleIndices.delete(index);
        this.ensureRowActive(this.rowOf(index));
    }

    private ensureRowActive(row: number) {
        const candidates = this.visibleCandidates(row);
        const current = this.activeByRow.get(row);
        if (current !== undefined && candidates.includes(current)) {
            if (candidates.length >= 2) {
                if (!this.maxTimers.has(row)) this.scheduleMaxTimer(row);
            } else {
                this.clearMaxTimer(row);
            }
            return;
        }
        const next = candidates[0];
        this.clearMaxTimer(row);
        if (next === undefined) {
            if (current !== undefined) {
                this.activeByRow.delete(row);
                this.activeStartAt.delete(row);
                this.notifyIndex(current);
            }
            return;
        }
        this.activeByRow.set(row, next);
        this.activeStartAt.set(row, Date.now());
        if (candidates.length >= 2) this.scheduleMaxTimer(row);
        this.notifyIndex(current);
        this.notifyIndex(next);
    }

    /** Passa o vídeo ativo da fileira pro próximo candidato visível — chamado
     * pelo teto de segurança (MAX_ACTIVE_MS) ou por `handleEnded` quando já
     * passou o mínimo. */
    private advanceRow(row: number) {
        const candidates = this.visibleCandidates(row);
        const current = this.activeByRow.get(row);
        this.clearMaxTimer(row);
        if (candidates.length === 0) {
            if (current !== undefined) {
                this.activeByRow.delete(row);
                this.activeStartAt.delete(row);
                this.notifyIndex(current);
            }
            return;
        }
        const currentPos =
            current === undefined ? -1 : candidates.indexOf(current);
        const next = candidates[(currentPos + 1) % candidates.length];
        if (next === current) {
            if (candidates.length >= 2) this.scheduleMaxTimer(row);
            return;
        }
        this.activeByRow.set(row, next);
        this.activeStartAt.set(row, Date.now());
        if (candidates.length >= 2) this.scheduleMaxTimer(row);
        this.notifyIndex(current);
        this.notifyIndex(next);
    }

    /** O card chama isso quando o próprio `<video>` dispara `ended`. Retorna
     * `true` se a fileira revezou (o card deve parar, `isActive` vira false);
     * `false` se o card deve só se replay sozinho (ainda não passou o mínimo,
     * ou não há outro candidato visível pra assumir). */
    handleEnded(index: number): boolean {
        const row = this.rowOf(index);
        if (this.activeByRow.get(row) !== index) return false;
        const candidates = this.visibleCandidates(row);
        const startedAt = this.activeStartAt.get(row) ?? 0;
        const longEnough = Date.now() - startedAt >= MIN_ACTIVE_MS;
        if (candidates.length < 2 || !longEnough) return false;
        this.advanceRow(row);
        return true;
    }

    private notifyIndex(index: number | undefined) {
        if (index === undefined) return;
        this.listeners.get(index)?.forEach((cb) => cb());
    }

    subscribe(index: number, cb: () => void): () => void {
        let set = this.listeners.get(index);
        if (!set) {
            set = new Set();
            this.listeners.set(index, set);
        }
        set.add(cb);
        return () => {
            set!.delete(cb);
            if (set!.size === 0) this.listeners.delete(index);
        };
    }

    isActive(index: number): boolean {
        return this.activeByRow.get(this.rowOf(index)) === index;
    }
}

const RowAutoplayContext = createContext<RowAutoplayStore | null>(null);

/** Substitui o <div> de grid onde os cards moram — mede o nº de colunas de
 * verdade (via grid-template-columns computado) pra agrupar os cards em
 * fileiras, então funciona igual em qualquer breakpoint responsivo sem
 * precisar espelhar os breakpoints do Tailwind aqui. */
export function RowAutoplayGrid({
    className,
    gridRef: externalRef,
    children,
}: {
    className?: string;
    gridRef?: RefObject<HTMLDivElement | null>;
    children: ReactNode;
}) {
    const internalRef = useRef<HTMLDivElement | null>(null);
    const store = useMemo(() => new RowAutoplayStore(), []);

    useEffect(() => {
        const el = internalRef.current;
        if (!el) return;
        function updateColumns() {
            const template = getComputedStyle(el!).gridTemplateColumns;
            const columns = template.split(" ").filter(Boolean).length || 1;
            store.setColumns(columns);
        }
        updateColumns();
        const observer = new ResizeObserver(updateColumns);
        observer.observe(el);
        return () => observer.disconnect();
    }, [store]);

    return (
        <RowAutoplayContext.Provider value={store}>
            <div
                className={className}
                ref={(node) => {
                    internalRef.current = node;
                    if (externalRef) externalRef.current = node;
                }}
            >
                {children}
            </div>
        </RowAutoplayContext.Provider>
    );
}

/** Card com vídeo chama isso passando sua posição (`index`, mesma ordem do
 * `.map()` que o renderizou) — fora de um RowAutoplayGrid, `isActive`
 * sempre volta `true` (comportamento antigo: toca sempre que visível, em
 * loop). Dentro de um RowAutoplayGrid, o card deve tocar sem `loop` e
 * chamar `notifyEnded()` no evento `ended` do `<video>`. */
export function useRowAutoplay(index: number | undefined, hasVideo: boolean) {
    const store = useContext(RowAutoplayContext);
    const enabled = store !== null && hasVideo && index !== undefined;

    useEffect(() => {
        if (!enabled) return;
        store!.registerVideo(index!);
        return () => store!.unregisterVideo(index!);
    }, [enabled, store, index]);

    const subscribe = useCallback(
        (cb: () => void) => (enabled ? store!.subscribe(index!, cb) : () => {}),
        [enabled, store, index],
    );
    const getSnapshot = useCallback(
        () => (enabled ? store!.isActive(index!) : true),
        [enabled, store, index],
    );
    const isActive = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const setVisible = useCallback(
        (visible: boolean) => {
            if (enabled) store!.setVisible(index!, visible);
        },
        [enabled, store, index],
    );

    const notifyEnded = useCallback(
        () => (enabled ? store!.handleEnded(index!) : false),
        [enabled, store, index],
    );

    return { rowAutoplayEnabled: enabled, isActive, setVisible, notifyEnded };
}
