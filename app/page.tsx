import { CameraScanner } from "@/components/CameraScanner";

export default function Home() {
  return (
    <main className="min-h-dvh px-4 py-5 text-stone-50 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/75">
            Mobile AI value radar
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-normal text-stone-50">
            TreasureScan
          </h1>
          <p className="mt-2 max-w-xl text-base leading-6 text-stone-300">
            AI value radar before throwing history away.
          </p>
        </header>

        <CameraScanner />
      </div>
    </main>
  );
}
