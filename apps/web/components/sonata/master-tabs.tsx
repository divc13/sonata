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
  "flex-none px-0 text-sm font-medium text-muted-foreground data-active:text-foreground";

/** The master detail tabs. Panels are server rendered and pass through. */
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
        className="h-auto w-full justify-start gap-6 border-b border-border/60 pb-3"
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
