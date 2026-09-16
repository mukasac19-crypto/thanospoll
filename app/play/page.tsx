import { Game } from "@/components/Game";
import { EffectProvider } from "@/components/EffectProvider";

export const dynamic = "force-dynamic";

export default function PlayPage() {
  return (
    <main className="flex flex-1 flex-col">
      <EffectProvider>
        <Game />
      </EffectProvider>
    </main>
  );
}
