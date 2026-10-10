import React, { Suspense } from "react";
import { WatchContent } from "./WatchContent";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto py-6 px-4 space-y-4 animate-pulse">
          <div className="aspect-video w-full rounded-2xl bg-muted" />
          <div className="h-6 bg-muted rounded w-3/4" />
        </div>
      }
    >
      <WatchContent id={id} />
    </Suspense>
  );
}
