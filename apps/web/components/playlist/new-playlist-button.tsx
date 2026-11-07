"use client";

import { Button } from "@infinitunes/ui/components/button";
import { Plus } from "lucide-react";

import { controlStyles } from "~/lib/control-styles";

import { NewPlaylistForm } from "./new-playlist-form";

/**
 * The empty library's "Create Playlist" trigger. It lives in a client module
 * on purpose: `NewPlaylistForm` reads its child's props, and a server
 * component hands it a lazy client reference with no props to read.
 */
export function NewPlaylistButton() {
  return (
    <NewPlaylistForm>
      <Button className={controlStyles.textLg}>
        <Plus className="mr-1 size-4" />
        Create Playlist
      </Button>
    </NewPlaylistForm>
  );
}
