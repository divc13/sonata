"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@infinitunes/ui/components/tabs";
import type { ReactNode } from "react";

type MasterTabsProps = {
  overview: ReactNode;
  ownership: ReactNode;
  listeners: ReactNode;
  chain: ReactNode;
};

const triggerClassName =
  "flex-none px-0 text-sm font-medium text-muted-foreground pointer-coarse:min-h-11 data-active:text-foreground";

/**
 * The master detail tabs. Panels are server rendered and pass through.
 *
 * `h-auto!` is deliberate: the line variant pins the list to 32px, which
 * squeezed the triggers to 15px. Auto height lets the coarse-pointer min
 * height (44px) define the row and keeps the underline on the border.
 */
export function MasterTabs({
  overview,
  ownership,
  listeners,
  chain,
}: MasterTabsProps) {
  return (
    <Tabs defaultValue="overview" className="gap-6">
      <TabsList
        variant="line"
        className="h-auto! w-full justify-start gap-6 border-b border-border/60 pb-3"
      >
        <TabsTrigger value="overview" className={triggerClassName}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="ownership" className={triggerClassName}>
          Ownership
        </TabsTrigger>
        <TabsTrigger value="listeners" className={triggerClassName}>
          Listeners
        </TabsTrigger>
        <TabsTrigger value="chain" className={triggerClassName}>
          Chain
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="ownership">{ownership}</TabsContent>
      <TabsContent value="listeners">{listeners}</TabsContent>
      <TabsContent value="chain">{chain}</TabsContent>
    </Tabs>
  );
}
