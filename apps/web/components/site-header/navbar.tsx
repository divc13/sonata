import Link from "next/link";

import { GlassSurface } from "~/components/glass/glass-surface";
import { controlStyles } from "~/lib/control-styles";
import { cn } from "~/lib/utils";

import { SearchMenu } from "../search/search-menu";
import { TopSearch } from "../search/top-search";
import { AppSidebarTrigger } from "../sidebar";
import { ViewerSignedOut, ViewerUserMenu } from "../viewer";
import { LanguagePicker } from "./language-picker";
import { MainNav } from "./main-nav";
import { Toolbar } from "./toolbar";
import { ToolbarNavigation } from "./toolbar-navigation";

const capsuleClassName = "flex items-center rounded-full p-0.5";

const logInClassName = cn(
  controlStyles.text,
  "hidden items-center rounded-full font-medium md:flex",
);

const mainNavClassName = "hidden shrink-0 grow-0 lg:block";

export function Navbar() {
  return (
    <Toolbar>
      <AppSidebarTrigger className="hidden md:inline-flex" />

      <ToolbarNavigation />

      <MainNav className={mainNavClassName} />

      <div data-toolbar-title className="min-w-0 flex-1" />

      <div className="flex items-center justify-end gap-1 md:gap-2">
        <GlassSurface size="s" glassRole="toolbar" className={capsuleClassName}>
          <SearchMenu topSearch={<TopSearch />} />
        </GlassSurface>

        <GlassSurface size="s" glassRole="toolbar" className={capsuleClassName}>
          <LanguagePicker />
          <ViewerUserMenu />
        </GlassSurface>

        {/* The ghost reserves the button's width, so the capsules beside it do not slide when the session resolves. */}
        <ViewerSignedOut
          fallback={
            <GlassSurface
              variant="tinted"
              size="s"
              glassRole="toolbar"
              aria-hidden
              className="invisible"
              render={<span className={logInClassName} />}
            >
              Log in
            </GlassSurface>
          }
        >
          <GlassSurface
            variant="tinted"
            size="s"
            glassRole="toolbar"
            render={<Link href="/login" className={logInClassName} />}
          >
            Log in
          </GlassSurface>
        </ViewerSignedOut>
      </div>
    </Toolbar>
  );
}
