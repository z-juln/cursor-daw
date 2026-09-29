import * as path from "path";
import { TransportStatus } from "../types";

export interface PlaylistViewState {
  currentPath?: string;
  status: TransportStatus;
}

function samePath(a: string, b: string): boolean {
  return path.normalize(a) === path.normalize(b);
}

/** 行内播放按钮靠 contextValue 切换图标：播放 / 暂停。 */
export function scoreContextValue(
  absolutePath: string,
  state: PlaylistViewState,
): string {
  if (!state.currentPath || !samePath(state.currentPath, absolutePath)) {
    return "cursorDaw.score";
  }
  if (state.status === "playing") return "cursorDaw.scorePlaying";
  if (state.status === "paused") return "cursorDaw.scorePaused";
  return "cursorDaw.score";
}

export function isPlayingScore(
  absolutePath: string,
  state: PlaylistViewState,
): boolean {
  return Boolean(
    state.currentPath
    && samePath(state.currentPath, absolutePath)
    && state.status === "playing",
  );
}
