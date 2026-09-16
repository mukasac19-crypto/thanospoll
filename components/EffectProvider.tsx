"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { StoneField } from "@/lib/effects";
import type { EffectId } from "@/lib/stones";

type Fire = (el: HTMLElement | null, effect: EffectId) => void;

const EffectContext = createContext<Fire>(() => {});

export function useStoneEffect() {
  return useContext(EffectContext);
}

export function EffectProvider({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<StoneField | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const field = new StoneField(canvasRef.current);
    fieldRef.current = field;

    const onResize = () => field.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      field.destroy();
      fieldRef.current = null;
    };
  }, []);

  const fire = useCallback<Fire>((el, effect) => {
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    fieldRef.current?.emit(el, effect);
  }, []);

  return (
    <EffectContext.Provider value={fire}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50"
      />
    </EffectContext.Provider>
  );
}
